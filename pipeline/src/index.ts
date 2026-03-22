import path from "path";
import fs from "fs";
import { config, loadSettings, setUserLocation, authHeaders, authHeadersNoBody } from "./config";
import { log } from "./logger";
import { PipelineStats, Job, QueuedJob, ResumeData } from "./types";
import { scrapeJobs } from "./services/apify";
import { filterByLocation } from "./services/location-filter";
import { customizeResume } from "./services/claude";
import { PoolSelection } from "./types";
import { generatePdf, warmUpPdfBackend } from "./services/pdf-generator";
import { fixOrphanRisk } from "./services/layout-fixer";
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
 * Upload a generated PDF buffer to the server's InsForge storage.
 */
async function uploadResumeToTracker(filename: string, buffer: Buffer): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: "application/pdf" });
  formData.append("file", blob, filename);
  formData.append("filename", filename);

  const res = await fetch(`${config.JOB_TRACKER_URL}/api/resume-pool/upload`, {
    method: "POST",
    headers: {
      ...authHeadersNoBody(),
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { url: string };
  return data.url;
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

  // ── Step 1: Discover ATS company boards via Claude ──
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

  // ── Step 4: Load resume input — pool (preferred) ──
  let poolMode = false;
  let poolResumeSkills: string[] = [];
  let poolUserName = "Candidate";

  try {
    const [poolRes, profileRes] = await Promise.all([
      fetch(`${config.JOB_TRACKER_URL}/api/resume-pool/keywords`, { headers: authHeadersNoBody() }),
      fetch(`${config.JOB_TRACKER_URL}/api/resume-pool/profile`, { headers: authHeadersNoBody() }),
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

  // ── Phase 2: Process relevant jobs (AI resume tailoring + PDF) ──
  const intensityLabel = config.TAILORING_INTENSITY <= 3 ? "LOW" : config.TAILORING_INTENSITY <= 6 ? "MEDIUM" : "HIGH";
  const processLimit = config.MAX_JOBS_TEST_LIMIT > 0
    ? Math.min(relevantQueue.length, config.MAX_JOBS_TEST_LIMIT)
    : relevantQueue.length;

  if (config.MAX_JOBS_TEST_LIMIT > 0) {
    log.warn(`TEST MODE: will process up to ${config.MAX_JOBS_TEST_LIMIT} of ${relevantQueue.length} relevant jobs`);
  }

  log.step(`Processing ${processLimit} relevant jobs (tailoring: ${intensityLabel} ${config.TAILORING_INTENSITY}/10)...\n`);

  for (let i = 0; i < processLimit; i++) {
    const { job, score, matched, missing, resumeKeywords, jdKeywords } = relevantQueue[i];
    log.job(i + 1, processLimit, job.title, job.companyName);

    try {
      const matchReason = `Matched ${matched.length} skills: ${matched.slice(0, 5).join(", ")}${matched.length > 5 ? "..." : ""}. Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""}`;

      // ── Customize resume via Claude ──
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

        // Get full resumeData directly from AI
        const aiResult = await customizeResume(poolSelection, job.descriptionText);
        resumeData = aiResult.resumeData;
        jdAnalysis = aiResult.jd_analysis;

        // Fix orphan risk (projects heading stranded at bottom of page 1)
        resumeData = fixOrphanRisk(resumeData);

        // Add display order from config
        resumeData.order = config.RESUME_ORDER;

        // Back-fill company URL from JD if the scraper didn't find one
        if (!job.companyWebsite && jdAnalysis.company_url) {
          job.companyWebsite = jdAnalysis.company_url;
        }

        log.success(`Resume customized | Domain: ${jdAnalysis.domain} | Seniority: ${jdAnalysis.seniority}`);
        log.info(`Screened skills: ${jdAnalysis.screened_skills.join(", ")}`);
      } catch (err: any) {
        log.error(`Resume customization failed: ${err.message}`);
        stats.errors++;
        continue;
      }

      // ── Compute added & truly missing keywords after tailoring ──
      const tailoredSkillsText = [
        resumeData.skills?.languages || "",
        resumeData.skills?.frameworks || "",
        resumeData.skills?.dataAndMiddleware || "",
        resumeData.skills?.cloudAndDevops || "",
        resumeData.skills?.testingAndTools || "",
        resumeData.summary || "",
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
      // Re-warm before each job — Render free tier sleeps after ~30s idle,
      // and Claude tailoring takes ~40s, so the service is asleep by the time we arrive.
      await warmUpPdfBackend();
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generatePdf(resumeData);
        log.success(`PDF generated (${(pdfBuffer.length / 1024).toFixed(0)}KB)`);
      } catch (err: any) {
        log.error(`PDF generation failed: ${err.message}`);
        stats.errors++;
        continue;
      }

      // ── Upload PDF to InsForge Storage ──
      let resumeUrl = "";
      try {
        const candidateName = resumeData.personalInfo?.name || "CANDIDATE";
        const rawNameParts = candidateName.toUpperCase().replace(/[^A-Z\s]/g, "").trim().split(/\s+/);
        const nameParts = rawNameParts.length > 0 ? rawNameParts : ["CANDIDATE"];
        const roleClean = (job.title.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")) || "ROLE";
        const companyClean = (job.companyName.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")) || "COMPANY";
        const pdfFileName = `${nameParts.join("_")}_${roleClean}_${companyClean}_RESUME.pdf`;
        
        resumeUrl = await uploadResumeToTracker(pdfFileName, pdfBuffer);
        log.success(`PDF uploaded to cloud: ${pdfFileName}`);
      } catch (err: any) {
        log.error(`PDF upload failed: ${err.message}`);
        stats.errors++;
        continue;
      }

      // ── Attach resume URL to job in tracker ──
      try {
        await attachJobAssets(job, resumeUrl, "", jobCategory, score, matchReason, keywordData, resumeData);
        log.success("Resume attached to tracker (status: filtered)");
      } catch (err: any) {
        log.warn(`Tracker asset attach failed: ${err.message}`);
      }

      stats.applied++;

      // Rate limiting between jobs
      if (i < processLimit - 1) {
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
