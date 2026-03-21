import { ScrapedJob } from "../../types";
import { politeGet } from "./utils";

/**
 * Simplify Jobs scraper — fetches the listings.json from the SimplifyJobs GitHub repo.
 * Updated daily with new grad / intern / SWE positions.
 */
export async function scrapeSimplify(keywords: string[]): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = [];
  const kwLower = keywords.map((k) => k.toLowerCase());

  try {
    const res = await politeGet(
      "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/listings.json",
      30000
    );
    if (!res.ok) return jobs;
    const listings = (await res.json()) as any[];

    for (const item of listings) {
      const title = item.title || item.role || "";
      const titleLower = title.toLowerCase();
      if (!kwLower.some((kw) => titleLower.includes(kw))) continue;

      // Filter: only active listings
      if (item.is_visible === false || item.active === false) continue;

      const locations = Array.isArray(item.locations) ? item.locations.join(", ") : (item.location || "");
      jobs.push({
        title,
        companyName: item.company_name || item.company || "",
        link: item.url || item.application_url || "",
        applyUrl: item.url || item.application_url || "",
        location: locations,
        descriptionText: item.description || "",
        postedAt: item.date_posted || item.date_updated || undefined,
        source: "simplify",
        externalId: item.id || item.url || `${item.company_name}-${title}`,
        tags: item.terms || [],
      });
    }
  } catch {}
  return jobs;
}
