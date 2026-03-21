import crypto from "crypto";
import { ScrapedJob, Job } from "../../types";

export const SCRAPER_UA = "Mozilla/5.0 (compatible; JobTracker/1.0)";

export const HEADERS = {
  "User-Agent": SCRAPER_UA,
  Accept: "application/json, text/html, */*",
  "Accept-Language": "en,en-US;q=0.9",
};

/** Compute SHA-256 hash for deduplication (title + company only, ignores location) */
export function contentHash(title: string, company: string, _location?: string): string {
  const raw = `${title.toLowerCase().trim()}|${company.toLowerCase().trim()}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/** Compute freshness score (0–1) from a date string. 1 = posted today, 0 = 30+ days old */
export function freshnessScore(postedAt?: string): number {
  if (!postedAt) return 0.5;
  try {
    const posted = new Date(postedAt);
    if (isNaN(posted.getTime())) return 0.5;
    const daysOld = (Date.now() - posted.getTime()) / 86400000;
    if (daysOld <= 1) return 1.0;
    if (daysOld <= 3) return 0.9;
    if (daysOld <= 7) return 0.75;
    if (daysOld <= 14) return 0.55;
    if (daysOld <= 30) return 0.3;
    return 0.1;
  } catch { return 0.5; }
}

/** Fetch with timeout and user-agent */
export async function politeGet(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: HEADERS, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Convert a ScrapedJob to the Job format used by the rest of the pipeline */
export function toJob(j: ScrapedJob, hash: string, fresh: number): Job {
  return {
    id: j.externalId || hash,
    link: j.link || "",
    title: j.title,
    companyName: j.companyName,
    companyWebsite: j.companyWebsite,
    companyLogo: j.companyLogo,
    location: j.location || "",
    salary: j.salary || "",
    postedAt: j.postedAt || "",
    descriptionText: j.descriptionText || "",
    applicantsCount: j.applicantsCount || "",
    applyUrl: j.applyUrl || j.link || "",
    seniorityLevel: j.seniorityLevel || "",
    employmentType: Array.isArray(j.employmentType) ? j.employmentType.join(", ") : String(j.employmentType || ""),
    source: j.source,
    sources: [j.source],
    contentHash: hash,
    tags: j.tags,
    freshnessScore: fresh,
  };
}

/** Check if a job was posted within the last N days (default 14). Returns true if recent or unknown. */
export function isRecentJob(postedAt?: string, maxDays = 14): boolean {
  if (!postedAt) return true; // unknown date — keep it, let the pipeline decide
  try {
    const posted = new Date(postedAt);
    if (isNaN(posted.getTime())) return true;
    const daysOld = (Date.now() - posted.getTime()) / 86400000;
    return daysOld <= maxDays;
  } catch { return true; }
}

/** Location relevance check for scraper-level pre-filtering.
 *  For scrapers that pull from global sources, this does a quick check
 *  to see if the job is plausibly in the user's target region.
 *  The main location filter (location-filter.ts) does the thorough check later. */
export function isLocationRelevant(location?: string, description?: string): boolean {
  if (!location && !description) return false;
  const locLower = (location || "").toLowerCase();
  const desc = (description || "").slice(0, 2000).toLowerCase();
  const combined = `${locLower} ${desc.slice(0, 500)}`;

  // Remote/hybrid jobs — generally accept (main filter will handle)
  if (/remote|hybrid|wfh|work from home/i.test(combined)) {
    // Reject if explicitly restricted to a single country
    if (/\b(us[- ]only|usa[- ]only|north america only|canada only|india only|apac only)\b/i.test(`${locLower} ${desc}`)) {
      return false;
    }
    return true;
  }

  // If there's a location string, accept it — the main filter will check regions
  if (locLower.trim().length > 0) return true;

  return false;
}
