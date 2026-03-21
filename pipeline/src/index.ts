import path from "path";
import fs from "fs";
import { config, loadSettings, setUserLocation, authHeaders, authHeadersNoBody } from "./config";
import { log } from "./logger";
import { PipelineStats, Job, QueuedJob, ResumeData, EnhancedBulletResult } from "./types";
import { scrapeJobs } from "./services/apify";
import { filterByLocation } from "./services/location-filter";
import { enhanceResumeBullets } from "./services/gemini";
import { PoolSelection } from "./types";
import { generatePdf, warmUpPdfBackend } from "./services/pdf-generator";
import {
  checkDuplicate,
  postFilteredJob,
  attachJobAssets,
} from "./services/job-tracker";
import { scrapeAllSources } from "./services/scrapers/orchestrator";
import { mergeJobSources, computePriority } from "./services/deduplicator";
import { extractSkills, computeRelevance } from "./services/skill-matcher";
import { filterBySeniority } from "./services/seniority-filter";
import { discoverATSSlugs } from "./services/ats-discovery";

// Local resume storage directory (served by the Express server)
const RESUMES_DIR = path.join(__dirname, "..", "..", "server", "resumes");

function ensureResumesDir() {
  if (!fs.existsSync(RESUMES_DIR)) {
    fs.mkdirSync(RESUMES_DIR, { recursive: true });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Detect job category from title and description.
 */
function detectJobCategory(title: string, description: string): string | null {
  const text = (title + " " + (description || "")).toLowerCase();
  if (/\bintern(ship)?\b/.test(text)) return "intern";
  if (/graduate programme|grad programme|graduate program|grad scheme|new grad|graduate\s+recruit|graduate\s+role/.test(text)) return "graduate";
  if (/\bstartup\b|seed.?stage|series\s+[a-z0-9]+|pre.?seed|early.?stage|scale.?up/i.test(text)) return "startup";
  return null;
}

/**
 * Assemble full ResumeData from pool (structure/metadata) + AI enhancements (bullets/summary/skills).
 * Pool provides: personalInfo, education, dates, titles, companies, locations.
 * AI provides: enhanced bullet points, tailored summary, reordered skills, jd_analysis.
 */
function assembleResumeFromPool(pool: PoolSelection, ai: EnhancedBulletResult): ResumeData {
  const parseDate = (d?: string | null) => {
    if (!d) return 0;
    const t = new Date(d).getTime();
    return isNaN(t) ? 0 : t;
  };

  // Sort pool items reverse-chronologically
  const sortedExps = [...pool.experiences].sort((a, b) =>
    parseDate(b.end_date ?? "9999-12-31") - parseDate(a.end_date ?? "9999-12-31")
    || parseDate(b.start_date) - parseDate(a.start_date));
  const sortedProjs = [...pool.projects].sort((a, b) =>
    parseDate(b.end_date ?? "9999-12-31") - parseDate(a.end_date ?? "9999-12-31")
    || parseDate(b.start_date) - parseDate(a.start_date));

  // Build a lookup map from AI experience bullets by title+company (lowercased)
  const aiExpMap = new Map<string, EnhancedBulletResult["experience"][0]>();
  for (const exp of ai.experience) {
    aiExpMap.set(`${exp.title.toLowerCase()}|${exp.company.toLowerCase()}`, exp);
  }

  // Build a lookup map from AI project bullets by name (lowercased)
  const aiProjMap = new Map<string, EnhancedBulletResult["projects"][0]>();
  for (const proj of ai.projects) {
    aiProjMap.set(proj.name.toLowerCase(), proj);
  }

  const experience = sortedExps.map(exp => {
    const date = exp.end_date ? `${exp.start_date} - ${exp.end_date}` : `${exp.start_date} - Present`;
    const poolBullets = exp.description.split("\n").filter(l => l.trim()).map(l =>
      l.replace(/^[-•]\s*/, "").trim()
    );

    // Match AI enhancements to pool bullets
    const aiExp = aiExpMap.get(`${exp.title.toLowerCase()}|${exp.company.toLowerCase()}`);
    const bulletPoints = poolBullets.map((original, idx) => {
      const aiBullet = aiExp?.bullets?.[idx];
      // Use AI improved text if available, otherwise keep original unchanged
      return {
        original,
        improved: aiBullet?.improved ?? null,
      };
    });

    return {
      title: exp.title,
      company: exp.company,
      date,
      location: exp.location || "",
      summary: exp.summary || "",
      bulletPoints,
    };
  });

  const projects = sortedProjs.map(proj => {
    const date = proj.start_date
      ? (proj.end_date ? `${proj.start_date} - ${proj.end_date}` : `${proj.start_date} - Present`)
      : "";
    const poolBullets = proj.description.split("\n").filter(l => l.trim()).map(l =>
      l.replace(/^[-•]\s*/, "").trim()
    );

    const aiProj = aiProjMap.get(proj.name.toLowerCase());
    const bulletPoints = poolBullets.map((original, idx) => {
      const aiBullet = aiProj?.bullets?.[idx];
      return {
        original,
        improved: aiBullet?.improved ?? null,
      };
    });

    return {
      title: proj.name,
      link: proj.url || "",
      date,
      summary: proj.summary || "",
      location: proj.location || "",
      bulletPoints,
    };
  });

  const personalInfo = {
    name: pool.profile.name || "",
    phone: pool.profile.phone || "",
    email: pool.profile.email || "",
    linkedin: pool.profile.linkedin || "",
    github: pool.profile.github || "",
    portfolio: pool.profile.portfolio || "",
  };

  const education = pool.education.length > 0
    ? pool.education.map(edu => ({
        institution: edu.institution,
        date: [edu.start_date, edu.end_date].filter(Boolean).join(" - "),
        degree: edu.degree + (edu.field ? ` in ${edu.field}` : ""),
        gpa: edu.grade || "",
      }))
    : [];

  // Use AI-tailored skills if provided, else fall back to pool's categorized skills
  const skills = ai.skills?.languages
    ? ai.skills
    : pool.skills;

  return {
    jd_analysis: ai.jd_analysis,
    resumeData: {
      personalInfo,
      summary: ai.summary || "",
      education,
      skills,
      order: config.RESUME_ORDER,
      experience,
      projects,
      certifications: [],
      awards: [],
    },
  };
}

async function main() {
  log.banner();

  // Load user-configurable settings from server DB (falls back to .env)
  await loadSettings();
  log.success("Settings loaded from server");

  const startTime = Date.now();

  const stats: PipelineStats = {
    scraped: 0,
    locationFiltered: 0,
    relevant: 0,
    applied: 0,
    skipped: 0,
    errors: 0,
  };

  // ── Step 1: Discover ATS company boards via Gemini ──
  const atsSlugs = await discoverATSSlugs();

  // ── Step 2: Scrape all free sources in parallel ──
  log.step("Scraping all job sources...");
  let allJobs: Job[] = [];
  try {
    allJobs = await scrapeAllSources(atsSlugs);

    // Sanitize jobs where company name is missing but embedded in title as "Company: Role"
    for (const job of allJobs) {
      if (!job.companyName && job.title.includes(": ")) {
        const colonIdx = job.title.indexOf(": ");
        job.companyName = job.title.slice(0, colonIdx).trim();
        job.title = job.title.slice(colonIdx + 2).trim();
      }
    }

    log.success(`Scrapers: ${allJobs.length} unique jobs`);
  } catch (err: any) {
    log.error(`Scraping failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 2b: Optionally scrape LinkedIn via Apify (if configured) ──
  if (config.APIFY_API_TOKEN && config.APIFY_ACTOR_ID && config.LINKEDIN_SEARCH_URL) {
    log.step("Scraping LinkedIn jobs via Apify...");
    try {
      const linkedInJobs = await scrapeJobs();
      log.success(`Scraped ${linkedInJobs.length} jobs from LinkedIn`);
      allJobs = mergeJobSources(allJobs, linkedInJobs);
      log.success(`Merged total: ${allJobs.length} unique jobs`);
    } catch (err: any) {
      log.warn(`LinkedIn scraping failed: ${err.message} — continuing with free sources`);
    }
  }

  stats.scraped = allJobs.length;

  // ── Step 2c: Freshness cutoff — reject jobs older than configured max days ──
  const cutoffMs = Date.now() - config.MAX_AGE_DAYS * 86400000;
  const freshJobs = allJobs.filter((j) => {
    if (!j.postedAt) return true;
    try {
      const posted = new Date(j.postedAt);
      return isNaN(posted.getTime()) || posted.getTime() >= cutoffMs;
    } catch { return true; }
  });
  const staleDropped = allJobs.length - freshJobs.length;
  if (staleDropped > 0) {
    log.success(`Freshness filter: ${freshJobs.length} fresh jobs (${staleDropped} older than ${config.MAX_AGE_DAYS} days dropped)`);
  }

  // ── Step 2d: Archive ALL scraped jobs for historical skills analysis ──
  try {
    const archivePayload = freshJobs.map((j) => ({
      title: j.title,
      companyName: j.companyName,
      location: j.location,
      description: j.descriptionText,
      source: j.source || "unknown",
      contentHash: j.contentHash || "",
    }));
    await fetch(`${config.JOB_TRACKER_URL}/api/skills/archive`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ jobs: archivePayload }),
    });
    log.success(`Archived ${freshJobs.length} jobs for skills analysis`);
  } catch (err: any) {
    log.warn(`Job archive failed: ${err.message}`);
  }

  // ── Step 3: Filter by country ──
  log.step(`Filtering by country (${config.TARGET_COUNTRIES})...`);
  const locationFiltered = filterByLocation(freshJobs);
  stats.locationFiltered = locationFiltered.length;
  log.success(
    `${locationFiltered.length} jobs in target countries (filtered out ${freshJobs.length - locationFiltered.length})`
  );

  if (locationFiltered.length === 0) {
    log.warn("No jobs in target countries. Pipeline complete.");
    log.summary(stats);
    return;
  }

  // Sort by freshness (newest first)
  locationFiltered.sort((a, b) => (b.freshnessScore ?? 0.5) - (a.freshnessScore ?? 0.5));

  // ── Step 3b: Batch DB duplicate check (before processing loop) ──
  log.step("Pre-filtering duplicates against tracker DB...");
  const DEDUP_CONCURRENCY = 10;
  const newJobs: Job[] = [];
  let dbDuplicatesFound = 0;
  let dbUnreachableSkipped = 0;

  for (let i = 0; i < locationFiltered.length; i += DEDUP_CONCURRENCY) {
    const batch = locationFiltered.slice(i, i + DEDUP_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (job): Promise<{ job: Job; status: "new" | "duplicate" | "unreachable" }> => {
        if (!job.link && !job.title) return { job, status: "new" };
        const result = await checkDuplicate(job.link || "", job.title, job.companyName);
        if (result === null) return { job, status: "unreachable" };
        if (result === true) return { job, status: "duplicate" };
        return { job, status: "new" };
      })
    );
    for (const { job, status } of results) {
      if (status === "new") newJobs.push(job);
      else if (status === "duplicate") dbDuplicatesFound++;
      else dbUnreachableSkipped++;
    }
  }

  stats.skipped += dbDuplicatesFound + dbUnreachableSkipped;
  const dedupParts: string[] = [];
  if (dbDuplicatesFound > 0) dedupParts.push(`${dbDuplicatesFound} already in tracker`);
  if (dbUnreachableSkipped > 0) dedupParts.push(`${dbUnreachableSkipped} skipped (tracker unreachable)`);
  log.success(
    dedupParts.length > 0
      ? `${newJobs.length} new jobs after dedup (${dedupParts.join(", ")} removed)`
      : `${newJobs.length} new jobs (no duplicates found)`
  );

  if (newJobs.length === 0) {
    log.warn("All jobs already in tracker. Pipeline complete.");
    log.summary(stats);
    return;
  }

  // ── Step 3c: Filter by seniority level and max YOE requirement ──
  let filteredJobs = newJobs;
  if (config.JOB_LEVELS || config.MAX_REQ_YOE > 0) {
    log.step("Filtering by seniority level and experience requirements...");
    const seniorityResult = filterBySeniority(newJobs, config.JOB_LEVELS, config.MAX_REQ_YOE);
    filteredJobs = seniorityResult.accepted;
    stats.skipped += seniorityResult.rejectedCount;

    const parts: string[] = [];
    if (seniorityResult.levelRejected > 0) parts.push(`${seniorityResult.levelRejected} wrong seniority`);
    if (seniorityResult.yoeRejected > 0) parts.push(`${seniorityResult.yoeRejected} exceed ${config.MAX_REQ_YOE} YOE`);
    log.success(
      parts.length > 0
        ? `${filteredJobs.length} jobs after seniority filter (${parts.join(", ")} removed)`
        : `${filteredJobs.length} jobs (all passed seniority filter)`
    );

    if (filteredJobs.length === 0) {
      log.warn("No jobs match seniority/YOE criteria. Pipeline complete.");
      log.summary(stats);
      return;
    }
  }

  // ── Step 4: Load resume input — pool (preferred) or Google Docs (fallback) ──
  let poolMode = false;
  let poolResumeSkills: string[] = [];
  let poolUserName = "Candidate";
  let poolUserEducation = "a relevant academic background";

  try {
    const [poolRes, profileRes, educationRes] = await Promise.all([
      fetch(`${config.JOB_TRACKER_URL}/api/resume-pool/keywords`, { headers: authHeadersNoBody() }),
      fetch(`${config.JOB_TRACKER_URL}/api/resume-pool/profile`, { headers: authHeadersNoBody() }),
      fetch(`${config.JOB_TRACKER_URL}/api/resume-pool/education`, { headers: authHeadersNoBody() }),
    ]);

    if (poolRes.ok) {
      const poolData = await poolRes.json() as { keywords: string[]; hasPool: boolean };
      if (poolData.hasPool && poolData.keywords.length > 0) {
        poolMode = true;
        poolResumeSkills = poolData.keywords;
        log.success(`Resume pool loaded: ${poolResumeSkills.length} skills from pool`);
      }
    }

    if (profileRes.ok) {
      const profile = await profileRes.json() as { name?: string; location?: string };
      if (profile.name) poolUserName = profile.name;
      if (profile.location) setUserLocation(profile.location);
    }

    if (educationRes.ok) {
      const eduList = await educationRes.json() as { degree?: string; field?: string; institution?: string }[];
      if (eduList.length > 0) {
        const edu = eduList[0];
        const degreePart = [edu.degree, edu.field].filter(Boolean).join(" in ");
        if (degreePart && edu.institution) {
          poolUserEducation = `${degreePart} from ${edu.institution}`;
        } else if (degreePart) {
          poolUserEducation = degreePart;
        }
      }
    }

    if (poolUserName !== "Candidate") {
      log.success(`User profile loaded: ${poolUserName}`);
    }
  } catch {
    log.error("Could not reach the server. Make sure the client and server are running.");
    process.exit(1);
  }

  if (!poolMode) {
    log.error("No Resume Pool found. Add your experiences, projects, and skills in the dashboard under Resume Pool.");
    process.exit(1);
  }

  // ── Phase 1: Local skill-based relevance scoring (no AI calls) ──
  log.step("Extracting resume skills for local matching...");
  const rawSkillResult = extractSkills(poolResumeSkills.join(", "));
  const resolvedResumeSkills = rawSkillResult.skills.length > 0 ? rawSkillResult.skills : poolResumeSkills;
  log.success(`Resume skills: ${resolvedResumeSkills.length} canonical skills (from pool)`);

  log.step(`Scoring ${filteredJobs.length} jobs locally (threshold: ${config.RELEVANCE_SCORE_THRESHOLD}/10)...`);
  const relevantQueue: QueuedJob[] = [];

  for (let i = 0; i < filteredJobs.length; i++) {
    const job = filteredJobs[i];
    const jdSkillResult = extractSkills(job.descriptionText || "");
    const relevance = computeRelevance(resolvedResumeSkills, jdSkillResult.skills);

    if (relevance.score >= config.RELEVANCE_SCORE_THRESHOLD) {
      relevantQueue.push({
        job,
        score: relevance.score,
        matched: relevance.matched,
        missing: relevance.missing,
        resumeKeywords: relevance.resumeKeywords,
        jdKeywords: relevance.jdKeywords,
      });
      log.success(`[${i + 1}/${filteredJobs.length}] ${job.title} @ ${job.companyName} — score ${relevance.score}/10 (${relevance.matched.length} matched, ${relevance.missing.length} missing)`);
    }
  }

  // Rank by score descending — highest relevance processed first
  relevantQueue.sort((a, b) => b.score - a.score || b.matched.length - a.matched.length);

  stats.relevant = relevantQueue.length;
  log.success(`Phase 1 complete: ${relevantQueue.length} relevant jobs out of ${filteredJobs.length} scored`);
  if (relevantQueue.length > 0) {
    log.info(`Top job: ${relevantQueue[0].job.title} @ ${relevantQueue[0].job.companyName} (score ${relevantQueue[0].score}/10)`);
  }

  if (relevantQueue.length === 0) {
    log.warn("No relevant jobs found. Pipeline complete.");
    log.summary(stats);
    return;
  }

  // ── Step 4b: Wake up PDF backend before processing starts ──
  await warmUpPdfBackend();

  // ── Phase 2: Process relevant jobs (AI resume tailoring + PDF) ──
  const intensityLabel = config.TAILORING_INTENSITY <= 3 ? "LOW" : config.TAILORING_INTENSITY <= 6 ? "MEDIUM" : "HIGH";
  const processLimit = config.MAX_JOBS_TEST_LIMIT > 0
    ? Math.min(relevantQueue.length, config.MAX_JOBS_TEST_LIMIT)
    : relevantQueue.length;

  if (config.MAX_JOBS_TEST_LIMIT > 0) {
    log.warn(`TEST MODE: will process up to ${config.MAX_JOBS_TEST_LIMIT} of ${relevantQueue.length} relevant jobs`);
  }

  log.step(`Processing ${processLimit} relevant jobs (tailoring: ${intensityLabel} ${config.TAILORING_INTENSITY}/10)...\n`);

  for (let i = 0; i < relevantQueue.length; i++) {
    const { job, score, matched, missing, resumeKeywords, jdKeywords } = relevantQueue[i];
    log.job(i + 1, relevantQueue.length, job.title, job.companyName);

    try {
      const matchReason = `Matched ${matched.length} skills: ${matched.slice(0, 5).join(", ")}${matched.length > 5 ? "..." : ""}. Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""}`;

      // ── Customize resume via Gemini ──
      const jobCategory = detectJobCategory(job.title, job.descriptionText || "");
      let resumeData: ResumeData;
      let jdAnalysis;
      try {
        const selectRes = await fetch(`${config.JOB_TRACKER_URL}/api/resume-pool/select`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ jdKeywords }),
        });
        if (!selectRes.ok) throw new Error(`Pool select failed: ${selectRes.status}`);
        const poolSelection = await selectRes.json() as PoolSelection;
        log.info(`Pool: ${poolSelection.experiences.length} experiences, ${poolSelection.projects.length} projects selected`);

        // AI returns only enhanced bullets + summary + skills
        const aiResult = await enhanceResumeBullets(poolSelection, job.descriptionText, resumeKeywords, jdKeywords);
        // Pipeline assembles full ResumeData from pool structure + AI enhancements
        resumeData = assembleResumeFromPool(poolSelection, aiResult);
        jdAnalysis = aiResult.jd_analysis;
        log.success(`Bullets enhanced: ${aiResult.experience.length} experiences, ${aiResult.projects.length} projects`);
        log.success(`Resume customized | Domain: ${jdAnalysis.domain} | Seniority: ${jdAnalysis.seniority}`);
        log.info(`Screened skills: ${jdAnalysis.screened_skills.join(", ")}`);
      } catch (err: any) {
        log.error(`Resume customization failed: ${err.message}`);
        stats.errors++;
        continue;
      }

      // ── Compute added & truly missing keywords after tailoring ──
      const tailoredSkillsText = [
        resumeData.resumeData?.skills?.languages || "",
        resumeData.resumeData?.skills?.frameworks || "",
        resumeData.resumeData?.skills?.dataAndMiddleware || "",
        resumeData.resumeData?.skills?.cloudAndDevops || "",
        resumeData.resumeData?.skills?.testingAndTools || "",
        resumeData.resumeData?.summary || "",
      ].join(" ");
      const tailoredSkills = extractSkills(tailoredSkillsText);
      const tailoredSet = new Set(tailoredSkills.skills.map(s => s.toLowerCase()));
      const resumeSet = new Set(resumeKeywords.map(s => s.toLowerCase()));

      // Added: skills in the tailored resume that weren't in the original resume but ARE in JD
      const jdSet = new Set(jdKeywords.map(s => s.toLowerCase()));
      const addedKeywords = tailoredSkills.skills.filter(
        s => !resumeSet.has(s.toLowerCase()) && jdSet.has(s.toLowerCase())
      );
      // Truly missing: JD skills that are STILL not in the tailored resume
      const trulyMissing = jdKeywords.filter(
        s => !tailoredSet.has(s.toLowerCase()) && !resumeSet.has(s.toLowerCase())
      );

      if (addedKeywords.length > 0) {
        log.info(`Added keywords: ${addedKeywords.join(", ")}`);
      }
      if (trulyMissing.length > 0) {
        log.info(`Still missing: ${trulyMissing.join(", ")}`);
      }

      const keywordData = {
        resumeKeywords,
        jdKeywords,
        matchedKeywords: matched,
        addedKeywords,
        missingKeywords: trulyMissing,
      };

      // ── Post filtered job to tracker ──
      try {
        await postFilteredJob(job, score, matchReason, false, jobCategory, keywordData);
        log.success("Posted to tracker (filtered)");
      } catch (err: any) {
        log.warn(`Job tracker post failed: ${err.message}`);
      }

      // ── Generate PDF ──
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generatePdf(resumeData);
        log.success(`PDF generated (${(pdfBuffer.length / 1024).toFixed(0)}KB)`);
      } catch (err: any) {
        log.error(`PDF generation failed: ${err.message}`);
        stats.errors++;
        continue;
      }

      // ── Save PDF locally ──
      try {
        ensureResumesDir();
      } catch (err: any) {
        log.error(`Cannot create resumes directory: ${err.message}`);
        stats.errors++;
        continue;
      }
      const candidateName = resumeData.resumeData?.personalInfo?.name || "CANDIDATE";
      const rawNameParts = candidateName.toUpperCase().replace(/[^A-Z\s]/g, "").trim().split(/\s+/);
      const nameParts = rawNameParts.length > 0 ? rawNameParts : ["CANDIDATE"];
      const roleClean = (job.title.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")) || "ROLE";
      const companyClean = (job.companyName.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")) || "COMPANY";
      const pdfFileName = `${nameParts.join("_")}_${roleClean}_${companyClean}_RESUME.pdf`;
      fs.writeFileSync(path.join(RESUMES_DIR, pdfFileName), pdfBuffer);
      const resumeUrl = `${config.JOB_TRACKER_URL}/resumes/${encodeURIComponent(pdfFileName)}`;
      log.success(`PDF saved: ${pdfFileName}`);

      // ── Attach resume URL to job in tracker ──
      try {
        await attachJobAssets(job, resumeUrl, "", jobCategory, score, matchReason, keywordData, resumeData);
        log.success("Resume attached to tracker (status: filtered)");
      } catch (err: any) {
        log.warn(`Tracker asset attach failed: ${err.message}`);
      }

      stats.applied++;

      // ── Test limit ──
      if (config.MAX_JOBS_TEST_LIMIT > 0 && stats.applied >= config.MAX_JOBS_TEST_LIMIT) {
        log.info(`TEST MODE: reached limit of ${config.MAX_JOBS_TEST_LIMIT} processed job(s). Stopping.`);
        break;
      }

      // Rate limiting between jobs
      if (i < relevantQueue.length - 1) {
        await delay(config.BATCH_DELAY_MS);
      }
    } catch (err: any) {
      log.error(`Unexpected error processing ${job.title} @ ${job.companyName}: ${err.message}`);
      stats.errors++;
    }
  }

  // ── Pipeline complete ──
  const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
  log.info(`Pipeline completed in ${elapsedMin} minutes`);
  log.summary(stats);

  // ── Save skills snapshot for today ──
  try {
    const today = new Date().toISOString().split("T")[0];
    const skillsRes = await fetch(`${config.JOB_TRACKER_URL}/api/skills/current`, { headers: authHeadersNoBody() });
    if (skillsRes.ok) {
      const skillsData = (await skillsRes.json()) as any;
      await fetch(`${config.JOB_TRACKER_URL}/api/skills/snapshot`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ date: today, total_jobs: skillsData.total_jobs, skills: skillsData.skills }),
      });
      log.success("Skills snapshot saved");
    }
  } catch (err: any) {
    log.warn(`Skills snapshot failed: ${err.message}`);
  }
}

main().catch((err) => {
  log.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
