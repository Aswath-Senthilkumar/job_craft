import { ScrapedJob } from "../../types";
import { politeGet } from "./utils";
import { log } from "../../logger";

/**
 * Ashby ATS scraper — uses the public Job Board API.
 * Endpoint: GET https://api.ashbyhq.com/posting-api/job-board/{company}
 * No auth required.
 */
export async function scrapeAshby(keywords: string[], companySlugs: string[]): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = [];
  if (companySlugs.length === 0) return jobs;

  const kwLower = keywords.map((k) => k.toLowerCase());

  for (const slug of companySlugs) {
    try {
      const res = await politeGet(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
      if (!res.ok) continue;
      const data: any = await res.json();
      const postings = data.jobs || [];

      for (const item of postings) {
        const title = item.title || "";
        const titleLower = title.toLowerCase();
        if (!kwLower.some((kw) => titleLower.includes(kw))) continue;

        const location = item.location || item.locationName || "";
        jobs.push({
          title,
          companyName: item.departmentName ? `${slug} (${item.departmentName})` : slug,
          link: item.jobUrl || item.hostedUrl || `https://jobs.ashbyhq.com/${slug}/${item.id}`,
          applyUrl: item.applyUrl || item.hostedUrl || "",
          location,
          descriptionText: (item.descriptionPlain || item.descriptionHtml || "").replace(/<[^>]+>/g, " ").trim().slice(0, 3000),
          postedAt: item.publishedAt || item.updatedAt || undefined,
          source: "ashby",
          externalId: item.id || `${slug}-${title}`,
        });
      }
    } catch (err: any) {
      log.warn(`Ashby [${slug}] failed: ${err.message}`);
    }
  }
  return jobs;
}
