import { config, authHeaders, authHeadersNoBody } from "../config";
import { Job, DuplicateCheckResult } from "../types";
import { log } from "../logger";

const API_URL = () => `${config.JOB_TRACKER_URL}/api/jobs`;

const FETCH_TIMEOUT_MS = 10000; // 10 second timeout for all tracker calls

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Returns true if job exists, false if not found, null if tracker is unreachable.
 * Checks by job_link AND by title+company to catch same role posted for multiple locations.
 */
export async function checkDuplicate(jobLink: string, title?: string, companyName?: string): Promise<DuplicateCheckResult> {
  try {
    const params = new URLSearchParams();
    if (jobLink) params.set("job_link", jobLink);
    if (title) params.set("job_title", title);
    if (companyName) params.set("company_name", companyName);
    const res = await fetch(
      `${API_URL()}/exists?${params.toString()}`,
      { signal: withTimeout(FETCH_TIMEOUT_MS), headers: authHeadersNoBody() }
    );
    if (!res.ok) {
      log.warn(`Duplicate check returned HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as any;
    return data.exists === true;
  } catch (err: any) {
    log.warn(`Job tracker unreachable for duplicate check: ${err.message}`);
    return null;
  }
}

export async function postFilteredJob(
  job: Job,
  score?: number,
  matchReason?: string,
  isReach?: boolean,
  jobCategory?: string | null,
  keywordData?: {
    resumeKeywords?: string[];
    jdKeywords?: string[];
    matchedKeywords?: string[];
    addedKeywords?: string[];
    missingKeywords?: string[];
  }
): Promise<void> {
  const res = await fetch(API_URL(), {
    method: "POST",
    headers: authHeaders(),
    signal: withTimeout(FETCH_TIMEOUT_MS),
    body: JSON.stringify({
      job_title: job.title,
      company_name: job.companyName,
      company_url: job.companyWebsite || null,
      job_link: job.link,
      location: job.location,
      salary: job.salary || null,
      seniority_level: job.seniorityLevel || null,
      applicants_count: job.applicantsCount || null,
      apply_url: job.applyUrl || null,
      description: job.descriptionText || null,
      match_score: score ?? null,
      match_reason: matchReason ?? null,
      notes: isReach ? "Reach role (senior/4+ years mentioned but still relevant)" : null,
      job_category: jobCategory ?? null,
      status: "filtered",
      applied_date: new Date().toISOString().split("T")[0],
      // Multi-source fields
      source: job.source || "linkedin",
      sources: job.sources ? JSON.stringify(job.sources) : null,
      source_count: job.sources ? job.sources.length : 1,
      content_hash: job.contentHash || null,
      posted_at: job.postedAt || null,
      freshness_score: job.freshnessScore ?? null,
      tags: job.tags ? JSON.stringify(job.tags) : null,
      // Skill matching keywords
      resume_keywords: keywordData?.resumeKeywords ? JSON.stringify(keywordData.resumeKeywords) : null,
      jd_keywords: keywordData?.jdKeywords ? JSON.stringify(keywordData.jdKeywords) : null,
      matched_keywords: keywordData?.matchedKeywords ? JSON.stringify(keywordData.matchedKeywords) : null,
      added_keywords: keywordData?.addedKeywords ? JSON.stringify(keywordData.addedKeywords) : null,
      missing_keywords: keywordData?.missingKeywords ? JSON.stringify(keywordData.missingKeywords) : null,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tracker POST failed: ${res.status} ${res.statusText} — ${body}`);
  }
}

/**
 * Attach resume URL and outreach email to the job — status stays "filtered".
 * Uses PATCH if the job already exists (found by job_link), otherwise falls back to POST.
 */
export async function attachJobAssets(
  job: Job,
  resumeUrl: string,
  outreachEmail: string,
  jobCategory?: string | null,
  score?: number,
  matchReason?: string,
  keywordData?: {
    resumeKeywords?: string[];
    jdKeywords?: string[];
    matchedKeywords?: string[];
    addedKeywords?: string[];
    missingKeywords?: string[];
  },
  resumeData?: object | null,
): Promise<void> {
  // First, try to find the existing job by job_link so we can PATCH it
  if (job.link) {
    try {
      const checkRes = await fetch(
        `${API_URL()}/exists?job_link=${encodeURIComponent(job.link)}`,
        { signal: withTimeout(FETCH_TIMEOUT_MS), headers: authHeadersNoBody() }
      );
      if (checkRes.ok) {
        const data = (await checkRes.json()) as any;
        if (data.exists && data.id) {
          // PATCH the existing job with resume + email
          const patchRes = await fetch(`${API_URL()}/${data.id}`, {
            method: "PATCH",
            headers: authHeaders(),
            signal: withTimeout(FETCH_TIMEOUT_MS),
            body: JSON.stringify({
              resume_url: resumeUrl,
              outreach_email: outreachEmail,
              match_score: score ?? null,
              match_reason: matchReason ?? null,
              job_category: jobCategory ?? null,
              resume_keywords: keywordData?.resumeKeywords ? JSON.stringify(keywordData.resumeKeywords) : null,
              jd_keywords: keywordData?.jdKeywords ? JSON.stringify(keywordData.jdKeywords) : null,
              matched_keywords: keywordData?.matchedKeywords ? JSON.stringify(keywordData.matchedKeywords) : null,
              added_keywords: keywordData?.addedKeywords ? JSON.stringify(keywordData.addedKeywords) : null,
              missing_keywords: keywordData?.missingKeywords ? JSON.stringify(keywordData.missingKeywords) : null,
              resume_data: resumeData ? JSON.stringify(resumeData) : null,
            }),
          });
          if (patchRes.ok) return;
        }
      }
    } catch {
      // Fall through to POST
    }
  }

  // Fallback: POST (upsert)
  const res = await fetch(API_URL(), {
    method: "POST",
    headers: authHeaders(),
    signal: withTimeout(FETCH_TIMEOUT_MS),
    body: JSON.stringify({
      job_title: job.title,
      company_name: job.companyName,
      company_url: job.companyWebsite || null,
      job_link: job.link,
      location: job.location,
      salary: job.salary || null,
      seniority_level: job.seniorityLevel || null,
      applicants_count: job.applicantsCount || null,
      apply_url: job.applyUrl || null,
      resume_url: resumeUrl,
      outreach_email: outreachEmail,
      description: job.descriptionText || null,
      match_score: score ?? null,
      match_reason: matchReason ?? null,
      job_category: jobCategory ?? null,
      status: "filtered",
      applied_date: new Date().toISOString().split("T")[0],
      source: job.source || "linkedin",
      sources: job.sources ? JSON.stringify(job.sources) : null,
      source_count: job.sources ? job.sources.length : 1,
      content_hash: job.contentHash || null,
      posted_at: job.postedAt || null,
      freshness_score: job.freshnessScore ?? null,
      tags: job.tags ? JSON.stringify(job.tags) : null,
      resume_keywords: keywordData?.resumeKeywords ? JSON.stringify(keywordData.resumeKeywords) : null,
      jd_keywords: keywordData?.jdKeywords ? JSON.stringify(keywordData.jdKeywords) : null,
      matched_keywords: keywordData?.matchedKeywords ? JSON.stringify(keywordData.matchedKeywords) : null,
      added_keywords: keywordData?.addedKeywords ? JSON.stringify(keywordData.addedKeywords) : null,
      missing_keywords: keywordData?.missingKeywords ? JSON.stringify(keywordData.missingKeywords) : null,
      resume_data: resumeData ? JSON.stringify(resumeData) : null,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tracker asset attach failed: ${res.status} ${res.statusText} — ${body}`);
  }
}
