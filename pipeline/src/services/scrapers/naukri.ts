import { ScrapedJob } from "../../types";
import { politeGet } from "./utils";
import * as cheerio from "cheerio";

/**
 * Naukri.com HTML scraper — India's #1 job board.
 * No public API; uses HTML parsing of search results.
 */
export async function scrapeNaukri(keywords: string[]): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = [];

  for (const kw of keywords.slice(0, 3)) {
    try {
      const slug = kw.toLowerCase().replace(/\s+/g, "-");
      const url = `https://www.naukri.com/${slug}-jobs?sort=date`;
      const res = await politeGet(url, 20000);
      if (!res.ok) continue;
      const html = await res.text();

      // Try extracting from embedded JSON (Naukri often embeds job data)
      const jsonMatch = html.match(/window\.__STARTER_DATA__\s*=\s*({[\s\S]*?});\s*<\/script>/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          const results = data?.jobList?.jobDetails || data?.searchResult?.jobResults || [];
          for (const item of results) {
            const title = item.title || item.jobTitle || "";
            const company = item.companyName || item.company || "";
            const location = item.placeholders?.find?.((p: any) => p.type === "location")?.label || item.location || item.ambiguityCity || "India";
            const jobId = item.jobId || item.id || "";
            if (!title) continue;
            jobs.push({
              title,
              companyName: company,
              link: item.jdURL || `https://www.naukri.com/job-listings-${jobId}`,
              location,
              salary: item.placeholders?.find?.((p: any) => p.type === "salary")?.label || item.salary || "",
              descriptionText: item.jobDescription || item.snippet || "",
              postedAt: item.createdDate || item.footerPlaceholderLabel || undefined,
              source: "naukri",
              externalId: jobId,
            });
          }
          continue;
        } catch {}
      }

      // Fallback: HTML parsing
      const $ = cheerio.load(html);
      $(".srp-jobtuple-wrapper, article.jobTuple, [class*='jobTuple'], [data-job-id]").each((_, el) => {
        const title = $(el).find("a.title, [class*='title'] a, h2 a").first().text().trim();
        const company = $(el).find("a.subTitle, [class*='companyInfo'] a, .comp-name").first().text().trim();
        const location = $(el).find(".locWdth, [class*='location'], .loc-wrap").first().text().trim();
        const href = $(el).find("a.title, [class*='title'] a, h2 a").first().attr("href") || "";
        const salary = $(el).find(".sal-wrap span, [class*='salary']").first().text().trim();
        const jobId = $(el).attr("data-job-id") || "";
        if (!title) return;
        jobs.push({
          title,
          companyName: company || "Company",
          link: href.startsWith("http") ? href : `https://www.naukri.com${href}`,
          location: location || "India",
          salary,
          source: "naukri",
          externalId: jobId || href,
        });
      });
    } catch {}
  }
  return jobs;
}
