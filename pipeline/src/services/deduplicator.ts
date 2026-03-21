import { Job, ScrapedJob } from "../types";
import { contentHash, freshnessScore, toJob } from "./scrapers/utils";

/**
 * Deduplicate an array of ScrapedJobs:
 * - Same title + company + location → merge sources[], keep best data
 * - Returns Job[] with source/sources/contentHash/freshnessScore populated
 */
export function deduplicateJobs(jobs: ScrapedJob[]): Job[] {
  const byHash = new Map<string, { job: ScrapedJob; sources: Set<string>; hashes: Set<string> }>();

  for (const job of jobs) {
    const hash = contentHash(job.title, job.companyName, job.location);
    const existing = byHash.get(hash);
    if (existing) {
      existing.sources.add(job.source);
      // Prefer the entry with more description
      if ((job.descriptionText?.length || 0) > (existing.job.descriptionText?.length || 0)) {
        existing.job = { ...job, source: existing.job.source }; // keep primary source
      }
    } else {
      byHash.set(hash, { job, sources: new Set([job.source]), hashes: new Set([hash]) });
    }
  }

  const result: Job[] = [];
  for (const [hash, { job, sources }] of byHash) {
    const fresh = freshnessScore(job.postedAt);
    const j = toJob(job, hash, fresh);
    j.sources = Array.from(sources);
    j.source = job.source;
    result.push(j);
  }

  return result;
}

/**
 * Merge additional job sources with existing jobs (e.g. Apify + free scrapers).
 * Existing jobs are treated as authoritative when the same job appears in both.
 */
export function mergeJobSources(existingJobs: Job[], newJobs: Job[]): Job[] {
  const byHash = new Map<string, Job>();

  for (const job of existingJobs) {
    const hash = job.contentHash || contentHash(job.title, job.companyName, job.location);
    job.contentHash = hash;
    job.sources = job.sources || [job.source || "unknown"];
    job.freshnessScore = freshnessScore(job.postedAt);
    byHash.set(hash, job);
  }

  const merged: Job[] = [...existingJobs];

  for (const newJob of newJobs) {
    const hash = newJob.contentHash || contentHash(newJob.title, newJob.companyName, newJob.location);
    const existing = byHash.get(hash);
    if (existing) {
      existing.sources = [...new Set([...(existing.sources || []), ...(newJob.sources || [newJob.source || "free"])])];
      if (!existing.descriptionText && newJob.descriptionText) {
        existing.descriptionText = newJob.descriptionText;
      }
    } else {
      newJob.contentHash = hash;
      merged.push(newJob);
    }
  }

  return merged;
}

/**
 * Compute priority score: combines match_score (0-10) and freshness (0-1).
 */
export function computePriority(matchScore: number, fresh: number): number {
  return matchScore * 0.7 + fresh * 10 * 0.3;
}
