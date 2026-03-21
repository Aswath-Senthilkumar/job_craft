import { ScrapedJob } from "../../types";
import { politeGet } from "./utils";
import { log } from "../../logger";

/**
 * Lever ATS scraper — uses the public Postings API.
 * Endpoint: GET https://api.lever.co/v0/postings/{company}
 * No auth required.
 */
export async function scrapeLever(keywords: string[], companySlugs: string[]): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = [];
  if (companySlugs.length === 0) return jobs;

  const kwLower = keywords.map((k) => k.toLowerCase());

  for (const slug of companySlugs) {
    try {
      const res = await politeGet(`https://api.lever.co/v0/postings/${slug}?mode=json`);
      if (!res.ok) continue;
      const postings = (await res.json()) as any[];

      for (const item of postings) {
        const title = item.text || "";
        const titleLower = title.toLowerCase();
        if (!kwLower.some((kw) => titleLower.includes(kw))) continue;

        const location = item.categories?.location || "";
        const team = item.categories?.team || "";
        jobs.push({
          title,
          companyName: slug,
          link: item.hostedUrl || item.applyUrl || "",
          applyUrl: item.applyUrl || item.hostedUrl || "",
          location,
          descriptionText: (item.descriptionPlain || item.description || "").replace(/<[^>]+>/g, " ").trim().slice(0, 3000),
          postedAt: item.createdAt ? new Date(item.createdAt).toISOString() : undefined,
          employmentType: item.categories?.commitment || "",
          source: "lever",
          externalId: item.id || `${slug}-${title}`,
          tags: team ? [team] : [],
        });
      }
    } catch (err: any) {
      log.warn(`Lever [${slug}] failed: ${err.message}`);
    }
  }
  return jobs;
}
