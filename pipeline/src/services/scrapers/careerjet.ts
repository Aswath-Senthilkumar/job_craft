import { ScrapedJob } from "../../types";
import { politeGet } from "./utils";
import { getLocationConfig } from "../../config";

/**
 * CareerJet public API — location/locale derived from user's primary location.
 * Register for an affiliate ID at the CareerJet partners page for your country.
 */
export async function scrapeCareerJet(keywords: string[], affiliateId?: string): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = [];
  const affid = affiliateId || "";
  const loc = getLocationConfig();
  const location = loc.careerjetLocation;
  const locale = loc.careerjetLocale;
  const siteUrl = loc.careerjetSiteUrl;

  for (const kw of keywords.slice(0, 3)) {
    try {
      const params = new URLSearchParams({
        affid,
        keywords: kw,
        locale_code: locale,
        sort: "date",
        pagesize: "20",
        user_ip: "1.2.3.4",
        url: siteUrl,
        user_agent: "Mozilla/5.0",
      });
      if (location) params.set("location", location);
      const res = await politeGet(`https://public.api.careerjet.net/search?${params}`);
      if (!res.ok) continue;
      const data: any = await res.json();
      for (const item of data.jobs || []) {
        jobs.push({
          title: item.title || "",
          companyName: item.company || "",
          link: item.url || "",
          location: item.locations || location || "",
          salary: item.salary || "",
          descriptionText: (item.description || "").slice(0, 15000),
          postedAt: item.date || undefined,
          source: "careerjet",
          externalId: item.url,
        });
      }
    } catch {}
  }
  return jobs;
}
