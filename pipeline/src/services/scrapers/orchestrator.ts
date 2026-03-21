import { Job, ScrapedJob } from "../../types";
import { config } from "../../config";
import { log } from "../../logger";
import { deduplicateJobs } from "../deduplicator";
import { ATSSlugs } from "../ats-discovery";

// ── Scraper imports ──
import { scrapeRemoteOK } from "./remoteok";
import { scrapeJobicy } from "./jobicy";
import { scrapeArbeitnow } from "./arbeitnow";
import { scrapeRemotive } from "./remotive";
import { scrapeHNHiring } from "./hn-hiring";
import { scrapeWWR } from "./wwr";
import { scrapeDevTo } from "./devto";
import { scrapeCareerJet } from "./careerjet";
import { scrapeGlassdoor } from "./glassdoor";
import { scrapeIndeed } from "./indeed";
import { scrapeAshby } from "./ashby";
import { scrapeLever } from "./lever";
import { scrapeGreenhouse } from "./greenhouse";
import { scrapeSimplify } from "./simplify";
import { scrapeNaukri } from "./naukri";

/** Source display names for logging and UI labels */
export const SOURCE_LABELS: Record<string, string> = {
  remoteok: "RemoteOK",
  jobicy: "Jobicy",
  arbeitnow: "Arbeitnow",
  remotive: "Remotive",
  hn_hiring: "HN Hiring",
  weworkremotely: "WWR",
  devto: "dev.to",
  careerjet: "CareerJet",
  glassdoor: "Glassdoor",
  indeed: "Indeed",
  ashby: "Ashby",
  lever: "Lever",
  greenhouse: "Greenhouse",
  simplify: "Simplify",
  naukri: "Naukri",
};

/**
 * Run ALL scrapers in parallel and return deduplicated Job[].
 * ATS scrapers (Ashby, Lever, Greenhouse) use AI-discovered company slugs.
 */
export async function scrapeAllSources(atsSlugs: ATSSlugs): Promise<Job[]> {
  const keywords = config.SEARCH_KEYWORDS.split(",").map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) {
    log.warn("SEARCH_KEYWORDS is empty — scrapers skipped");
    return [];
  }

  log.step(`Running all scrapers for keywords: ${keywords.slice(0, 5).join(", ")}...`);

  const scraperTasks: Promise<ScrapedJob[]>[] = [];

  function withLog(name: string, p: Promise<ScrapedJob[]>): Promise<ScrapedJob[]> {
    return p.catch((err) => { log.warn(`Scraper [${name}] failed: ${err.message}`); return []; });
  }

  // ── Free job board APIs (toggle-gated) ──
  if (config.SCRAPE_REMOTEOK) scraperTasks.push(withLog("RemoteOK", scrapeRemoteOK(keywords)));
  if (config.SCRAPE_JOBICY) scraperTasks.push(withLog("Jobicy", scrapeJobicy(keywords)));
  if (config.SCRAPE_ARBEITNOW) scraperTasks.push(withLog("Arbeitnow", scrapeArbeitnow(keywords)));
  if (config.SCRAPE_REMOTIVE) scraperTasks.push(withLog("Remotive", scrapeRemotive(keywords)));
  if (config.SCRAPE_HN) scraperTasks.push(withLog("HN Hiring", scrapeHNHiring(keywords)));
  if (config.SCRAPE_WWR) scraperTasks.push(withLog("WWR", scrapeWWR(keywords)));
  if (config.SCRAPE_DEVTO) scraperTasks.push(withLog("dev.to", scrapeDevTo(keywords)));
  if (config.SCRAPE_CAREERJET) scraperTasks.push(withLog("CareerJet", scrapeCareerJet(keywords, config.CAREERJET_AFFILIATE_ID)));
  if (config.SCRAPE_GLASSDOOR) scraperTasks.push(withLog("Glassdoor", scrapeGlassdoor(keywords)));
  if (config.SCRAPE_INDEED) scraperTasks.push(withLog("Indeed", scrapeIndeed(keywords)));
  if (config.SCRAPE_SIMPLIFY) scraperTasks.push(withLog("Simplify", scrapeSimplify(keywords)));
  if (config.SCRAPE_NAUKRI) scraperTasks.push(withLog("Naukri", scrapeNaukri(keywords)));

  // ── ATS company boards (toggle-gated + AI-discovered slugs) ──
  if (config.SCRAPE_ASHBY && atsSlugs.ashby.length > 0) {
    scraperTasks.push(withLog("Ashby", scrapeAshby(keywords, atsSlugs.ashby)));
  }
  if (config.SCRAPE_LEVER && atsSlugs.lever.length > 0) {
    scraperTasks.push(withLog("Lever", scrapeLever(keywords, atsSlugs.lever)));
  }
  if (config.SCRAPE_GREENHOUSE && atsSlugs.greenhouse.length > 0) {
    scraperTasks.push(withLog("Greenhouse", scrapeGreenhouse(keywords, atsSlugs.greenhouse)));
  }

  const results = await Promise.allSettled(scraperTasks);
  const allJobs: ScrapedJob[] = [];
  const sourceCounts: Record<string, number> = {};

  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const j of r.value) {
        allJobs.push(j);
        sourceCounts[j.source] = (sourceCounts[j.source] || 0) + 1;
      }
    }
  }

  // Log per-source counts
  for (const [src, cnt] of Object.entries(sourceCounts)) {
    log.info(`  ${SOURCE_LABELS[src] || src}: ${cnt} jobs`);
  }

  const deduped = deduplicateJobs(allJobs);
  log.success(`All scrapers: ${allJobs.length} raw → ${deduped.length} unique jobs`);

  return deduped;
}
