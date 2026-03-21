import { config } from "../config";
import { Job } from "../types";
import { log } from "../logger";

const BASE_URL = "https://api.apify.com/v2";

async function apifyFetch(path: string, options?: RequestInit): Promise<any> {
  const url = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}token=${config.APIFY_API_TOKEN}`;
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`Apify API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeJobs(): Promise<Job[]> {
  // Step 1: Start the actor run
  log.info("Starting Apify LinkedIn scraper...");
  const runResult = await apifyFetch(`/acts/${config.APIFY_ACTOR_ID}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      count: config.APIFY_JOB_COUNT,
      scrapeCompany: true,
      urls: [config.LINKEDIN_SEARCH_URL],
    }),
  });

  const runId = runResult.data.id;
  const datasetId = runResult.data.defaultDatasetId;
  log.info(`Actor run started (ID: ${runId})`);

  // Step 2: Poll until complete (with timeout)
  const pollIntervalMs = 10000;
  const maxPolls = Math.ceil((config.APIFY_MAX_POLL_MINUTES * 60 * 1000) / pollIntervalMs);
  let status = runResult.data.status;
  let pollCount = 0;

  while (status !== "SUCCEEDED" && status !== "FAILED" && status !== "ABORTED") {
    pollCount++;

    if (pollCount > maxPolls) {
      throw new Error(
        `Apify actor timed out after ${config.APIFY_MAX_POLL_MINUTES} minutes (run ID: ${runId}). ` +
        `Check https://console.apify.com/actors/runs/${runId} for status.`
      );
    }

    await delay(pollIntervalMs);
    const runInfo = await apifyFetch(`/actor-runs/${runId}`);
    status = runInfo.data.status;

    if (pollCount % 3 === 0) {
      log.info(`  Scraping in progress... (${Math.round(pollCount * 10 / 60)}min elapsed)`);
    }
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify actor run ${status}: ${runId}`);
  }

  // Step 3: Get dataset items
  log.success("Scraping complete, fetching results...");
  const dataset = await apifyFetch(`/datasets/${datasetId}/items`);

  // Validate that we got an array with data
  if (!Array.isArray(dataset)) {
    throw new Error("Apify returned unexpected format (expected array)");
  }

  // Log raw keys of first item so we can debug field name mismatches
  if (dataset.length > 0) {
    const firstItem = dataset[0];
    const locationRelatedKeys = Object.keys(firstItem).filter((k) =>
      /loc|place|city|country|region/i.test(k)
    );
    log.info(`  [debug] First item location-related keys: ${JSON.stringify(locationRelatedKeys)}`);
    log.info(`  [debug] First item location value: ${JSON.stringify(firstItem.location)}`);
  }

  // Filter out jobs missing critical fields
  const validJobs = dataset.filter((job: any) => {
    if (!job.link || !job.title || !job.companyName) {
      log.warn(`Skipping job with missing data: ${job.title || "unknown"} @ ${job.companyName || "unknown"}`);
      return false;
    }
    return true;
  });

  if (validJobs.length < dataset.length) {
    log.warn(`${dataset.length - validJobs.length} jobs dropped due to missing required fields`);
  }

  // Sanitize fields that Apify may return as objects/arrays instead of strings
  for (const job of validJobs) {
    if (job.employmentType && typeof job.employmentType !== "string") {
      job.employmentType = Array.isArray(job.employmentType)
        ? job.employmentType.join(", ")
        : String(job.employmentType);
    }
  }

  return validJobs as Job[];
}
