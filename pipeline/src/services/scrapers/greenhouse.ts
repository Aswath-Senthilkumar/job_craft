import { ScrapedJob } from "../../types";
import { politeGet } from "./utils";
import { log } from "../../logger";

/**
 * Greenhouse ATS scraper — uses the public Job Board API.
 * Endpoint: GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs
 * No auth required, no rate limiting on GET requests.
 */
export async function scrapeGreenhouse(keywords: string[], boardTokens: string[]): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = [];
  if (boardTokens.length === 0) return jobs;

  const kwLower = keywords.map((k) => k.toLowerCase());

  for (const token of boardTokens) {
    try {
      const res = await politeGet(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
      if (!res.ok) continue;
      const data: any = await res.json();
      const postings = data.jobs || [];

      for (const item of postings) {
        const title = item.title || "";
        const titleLower = title.toLowerCase();
        if (!kwLower.some((kw) => titleLower.includes(kw))) continue;

        const location = item.location?.name || "";
        const desc = (item.content || "").replace(/<[^>]+>/g, " ").trim();
        jobs.push({
          title,
          companyName: data.name || token,
          link: item.absolute_url || `https://boards.greenhouse.io/${token}/jobs/${item.id}`,
          applyUrl: item.absolute_url || "",
          location,
          descriptionText: desc.slice(0, 15000),
          postedAt: item.updated_at || item.created_at || undefined,
          source: "greenhouse",
          externalId: String(item.id),
        });
      }
    } catch (err: any) {
      log.warn(`Greenhouse [${token}] failed: ${err.message}`);
    }
  }
  return jobs;
}
