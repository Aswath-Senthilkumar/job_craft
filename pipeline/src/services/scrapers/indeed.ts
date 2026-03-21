import { ScrapedJob } from "../../types";
import { politeGet } from "./utils";
import { getLocationConfig } from "../../config";
import * as cheerio from "cheerio";

/** Indeed scraper — domain and location derived from user's primary location */
export async function scrapeIndeed(keywords: string[]): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = [];
  const loc = getLocationConfig();
  const domain = loc.indeedDomain;
  const location = loc.indeedLocation;

  for (const kw of keywords.slice(0, 3)) {
    try {
      const params = new URLSearchParams({ q: kw, fromage: "14", sort: "date" });
      if (location) params.set("l", location);
      const url = `https://${domain}/jobs?${params}`;
      const res = await politeGet(url);
      if (!res.ok) continue;
      const html = await res.text();

      // Extract mosaic-provider-jobcards JSON from script tag
      const mosaicMatch = html.match(/window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*({[\s\S]*?});\s*window\.mosaic/);
      if (mosaicMatch) {
        try {
          const mosaic = JSON.parse(mosaicMatch[1]);
          const results = mosaic?.metaData?.mosaicProviderJobCardsModel?.results || [];
          for (const item of results) {
            const title = item.title || item.displayTitle || "";
            const company = item.company || item.companyBrandingAttributes?.companyName || "";
            const itemLocation = item.jobLocationCity ? `${item.jobLocationCity}, ${item.jobLocationState || ""}`.replace(/,\s*$/, "") : location;
            const salary = item.salarySnippet?.text || item.estimatedSalary?.text || "";
            const jobKey = item.jobkey || item.jobId || "";
            jobs.push({
              title,
              companyName: company,
              link: `https://${domain}/viewjob?jk=${jobKey}`,
              applyUrl: item.thirdPartyApplyUrl || `https://${domain}/viewjob?jk=${jobKey}`,
              location: itemLocation,
              salary,
              descriptionText: item.snippet || "",
              postedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
              source: "indeed",
              externalId: jobKey,
            });
          }
        } catch {}
      }

      // Fallback: cheerio HTML scraping if mosaic extraction fails
      if (jobs.length === 0) {
        const $ = cheerio.load(html);
        $(".job_seen_beacon, .tapItem, [data-jk]").each((_, el) => {
          const title = $(el).find("h2.jobTitle span, [class*='jobTitle']").text().trim();
          const company = $(el).find("[data-testid='company-name'], .companyName").text().trim();
          const itemLocation = $(el).find("[data-testid='text-location'], .companyLocation").text().trim();
          const jobKey = $(el).attr("data-jk") || $(el).find("a").first().attr("data-jk") || "";
          if (!title) return;
          jobs.push({
            title, companyName: company || "Company", link: `https://${domain}/viewjob?jk=${jobKey}`,
            location: itemLocation || location, source: "indeed", externalId: jobKey,
          });
        });
      }
    } catch {}
  }
  return jobs;
}
