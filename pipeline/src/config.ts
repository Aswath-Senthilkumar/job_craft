import dotenv from "dotenv";
import { join } from "path";

dotenv.config({ path: join(__dirname, "..", ".env") });

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

// ── Secrets & infra (always from .env) ──────────────────────────────
const envConfig = {
  GEMINI_API_KEY: required("GEMINI_API_KEY"),
  APIFY_API_TOKEN: optional("APIFY_API_TOKEN", ""),
  APIFY_ACTOR_ID: optional("APIFY_ACTOR_ID", ""),
  JOB_TRACKER_URL: optional("JOB_TRACKER_URL", "http://localhost:3002"),
  PDF_BACKEND_URL: required("PDF_BACKEND_URL"),
  AUTH_TOKEN: optional("AUTH_TOKEN", ""),

  // Scraper-specific env (API keys only)
  CAREERJET_AFFILIATE_ID: optional("CAREERJET_AFFILIATE_ID", ""),
};

/** Returns auth headers if AUTH_TOKEN is set (for multi-user mode) */
export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.AUTH_TOKEN) headers["Authorization"] = `Bearer ${config.AUTH_TOKEN}`;
  return headers;
}

export function authHeadersNoBody(): Record<string, string> {
  if (config.AUTH_TOKEN) return { "Authorization": `Bearer ${config.AUTH_TOKEN}` };
  return {};
}

// ── User-configurable settings (defaults, overwritten by loadSettings) ──
const dbSettings = {
  SEARCH_KEYWORDS: "",
  TARGET_COUNTRIES: "",
  LINKEDIN_SEARCH_URL: "",
  RELEVANCE_SCORE_THRESHOLD: 5,
  TAILORING_INTENSITY: 5,
  BATCH_DELAY_MS: 2000,
  APIFY_JOB_COUNT: 100,
  APIFY_MAX_POLL_MINUTES: 10,
  MAX_JOBS_TEST_LIMIT: 0,
  MAX_AGE_DAYS: 14,
  JOB_LEVELS: "",
  MAX_REQ_YOE: 0,
  RESUME_ORDER: ["summary", "experience", "skills", "projects", "education"] as string[],

  // Scraper toggles (all enabled by default)
  SCRAPE_REMOTEOK: true,
  SCRAPE_JOBICY: true,
  SCRAPE_HN: true,
  SCRAPE_WWR: true,
  SCRAPE_ARBEITNOW: true,
  SCRAPE_REMOTIVE: true,
  SCRAPE_DEVTO: true,
  SCRAPE_CAREERJET: true,
  SCRAPE_GLASSDOOR: true,
  SCRAPE_INDEED: true,
  SCRAPE_SIMPLIFY: true,
  SCRAPE_NAUKRI: true,
  SCRAPE_ASHBY: true,
  SCRAPE_LEVER: true,
  SCRAPE_GREENHOUSE: true,
};

export const config = {
  ...envConfig,
  ...dbSettings,
};

/**
 * Fetch user-configurable settings from the server API (DB-backed).
 * Must be called at pipeline startup before any settings are used.
 * Falls back to .env values if the server is unreachable.
 */
export async function loadSettings(): Promise<void> {
  const url = `${config.JOB_TRACKER_URL}/api/settings`;
  try {
    const res = await fetch(url, { headers: authHeadersNoBody() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { config: Record<string, any> };
    const s = data.config;

    config.SEARCH_KEYWORDS = s.SEARCH_KEYWORDS ?? config.SEARCH_KEYWORDS;
    config.TARGET_COUNTRIES = s.TARGET_COUNTRIES ?? config.TARGET_COUNTRIES;
    config.LINKEDIN_SEARCH_URL = s.LINKEDIN_SEARCH_URL ?? config.LINKEDIN_SEARCH_URL;
    config.RELEVANCE_SCORE_THRESHOLD = s.RELEVANCE_SCORE_THRESHOLD ?? config.RELEVANCE_SCORE_THRESHOLD;
    config.TAILORING_INTENSITY = s.TAILORING_INTENSITY ?? config.TAILORING_INTENSITY;
    config.BATCH_DELAY_MS = s.BATCH_DELAY_MS ?? config.BATCH_DELAY_MS;
    config.APIFY_JOB_COUNT = s.APIFY_JOB_COUNT ?? config.APIFY_JOB_COUNT;
    config.APIFY_MAX_POLL_MINUTES = s.APIFY_MAX_POLL_MINUTES ?? config.APIFY_MAX_POLL_MINUTES;
    config.MAX_JOBS_TEST_LIMIT = s.MAX_JOBS_TEST_LIMIT ?? config.MAX_JOBS_TEST_LIMIT;
    config.MAX_AGE_DAYS = s.MAX_AGE_DAYS ?? config.MAX_AGE_DAYS;
    config.JOB_LEVELS = s.JOB_LEVELS ?? config.JOB_LEVELS;
    config.MAX_REQ_YOE = s.MAX_REQ_YOE ?? config.MAX_REQ_YOE;

    const order = s.RESUME_ORDER;
    if (typeof order === "string" && order.length > 0) {
      config.RESUME_ORDER = order.split(",").map((s: string) => s.trim()).filter(Boolean);
    }

    // Scraper toggles
    const scraperKeys = [
      "SCRAPE_REMOTEOK", "SCRAPE_JOBICY", "SCRAPE_HN", "SCRAPE_WWR",
      "SCRAPE_ARBEITNOW", "SCRAPE_REMOTIVE", "SCRAPE_DEVTO", "SCRAPE_CAREERJET",
      "SCRAPE_GLASSDOOR", "SCRAPE_INDEED", "SCRAPE_SIMPLIFY", "SCRAPE_NAUKRI",
      "SCRAPE_ASHBY", "SCRAPE_LEVER", "SCRAPE_GREENHOUSE",
    ] as const;
    for (const key of scraperKeys) {
      if (key in s) (config as any)[key] = Boolean(s[key]);
    }
  } catch (err: any) {
    // Fall back to .env values for pipeline settings if server is unreachable
    const env = process.env;
    if (env.SEARCH_KEYWORDS) config.SEARCH_KEYWORDS = env.SEARCH_KEYWORDS;
    if (env.TARGET_COUNTRIES) config.TARGET_COUNTRIES = env.TARGET_COUNTRIES;
    if (env.LINKEDIN_SEARCH_URL) config.LINKEDIN_SEARCH_URL = env.LINKEDIN_SEARCH_URL;
    if (env.RELEVANCE_SCORE_THRESHOLD) config.RELEVANCE_SCORE_THRESHOLD = parseInt(env.RELEVANCE_SCORE_THRESHOLD, 10);
    if (env.TAILORING_INTENSITY) config.TAILORING_INTENSITY = parseInt(env.TAILORING_INTENSITY, 10);
    if (env.BATCH_DELAY_MS) config.BATCH_DELAY_MS = parseInt(env.BATCH_DELAY_MS, 10);
    if (env.APIFY_JOB_COUNT) config.APIFY_JOB_COUNT = parseInt(env.APIFY_JOB_COUNT, 10);
    if (env.APIFY_MAX_POLL_MINUTES) config.APIFY_MAX_POLL_MINUTES = parseInt(env.APIFY_MAX_POLL_MINUTES, 10);
    if (env.MAX_JOBS_TEST_LIMIT) config.MAX_JOBS_TEST_LIMIT = parseInt(env.MAX_JOBS_TEST_LIMIT, 10);
    if (env.MAX_AGE_DAYS) config.MAX_AGE_DAYS = parseInt(env.MAX_AGE_DAYS, 10);
    if (env.JOB_LEVELS) config.JOB_LEVELS = env.JOB_LEVELS;
    if (env.MAX_REQ_YOE) config.MAX_REQ_YOE = parseInt(env.MAX_REQ_YOE, 10);
    if (env.RESUME_ORDER) config.RESUME_ORDER = env.RESUME_ORDER.split(",").map(s => s.trim()).filter(Boolean);

    console.warn(`[config] Could not fetch settings from server (${err.message}), using .env fallback`);
  }
}

// ── Derived mappings (computed from DB-backed settings) ─────────────

/** Map TARGET_COUNTRIES → geo codes for Jobicy/Arbeitnow APIs */
const COUNTRY_TO_GEO: Record<string, string> = {
  "united states": "us",
  "united kingdom": "uk",
  "ireland": "ireland",
  "canada": "canada",
  "germany": "germany",
  "netherlands": "netherlands",
  "france": "france",
  "australia": "australia",
  "india": "india",
  "singapore": "singapore",
  "remote": "",
};

export function getScraperGeos(): string[] {
  const countries = config.TARGET_COUNTRIES.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const geos = new Set<string>();
  for (const country of countries) {
    const geo = COUNTRY_TO_GEO[country];
    if (geo !== undefined && geo !== "") geos.add(geo);
  }
  return geos.size > 0 ? [...geos] : [""];
}

/** Map SEARCH_KEYWORDS → Remotive category slugs */
const KEYWORD_TO_REMOTIVE: Record<string, string> = {
  "software engineer": "software-dev",
  "backend developer": "software-dev",
  "frontend developer": "software-dev",
  "fullstack developer": "software-dev",
  "mobile developer": "software-dev",
  "ios developer": "software-dev",
  "android developer": "software-dev",
  "embedded engineer": "software-dev",
  "systems engineer": "software-dev",
  "data engineer": "data",
  "data scientist": "data",
  "machine learning engineer": "machine-learning",
  "ai engineer": "machine-learning",
  "devops engineer": "devops-sysadmin",
  "cloud engineer": "devops-sysadmin",
  "site reliability engineer": "devops-sysadmin",
  "infrastructure engineer": "devops-sysadmin",
  "platform engineer": "devops-sysadmin",
  "security engineer": "devops-sysadmin",
  "qa engineer": "qa",
};

// ── Primary location → Indeed / CareerJet config ────────────────────

interface LocationConfig {
  indeedDomain: string;
  indeedLocation: string;
  careerjetLocale: string;
  careerjetLocation: string;
  careerjetSiteUrl: string;
}

const LOCATION_MAP: Record<string, LocationConfig> = {
  "united states":       { indeedDomain: "indeed.com",       indeedLocation: "United States",       careerjetLocale: "en_US", careerjetLocation: "USA",             careerjetSiteUrl: "https://www.careerjet.com/" },
  "united kingdom":      { indeedDomain: "indeed.co.uk",     indeedLocation: "United Kingdom",      careerjetLocale: "en_GB", careerjetLocation: "UK",              careerjetSiteUrl: "https://www.careerjet.co.uk/" },
  "ireland":             { indeedDomain: "ie.indeed.com",    indeedLocation: "Ireland",             careerjetLocale: "en_IE", careerjetLocation: "Ireland",         careerjetSiteUrl: "https://www.careerjet.ie/" },
  "canada":              { indeedDomain: "ca.indeed.com",    indeedLocation: "Canada",              careerjetLocale: "en_CA", careerjetLocation: "Canada",          careerjetSiteUrl: "https://www.careerjet.ca/" },
  "germany":             { indeedDomain: "de.indeed.com",    indeedLocation: "Deutschland",         careerjetLocale: "de_DE", careerjetLocation: "Deutschland",     careerjetSiteUrl: "https://www.careerjet.de/" },
  "netherlands":         { indeedDomain: "nl.indeed.com",    indeedLocation: "Nederland",           careerjetLocale: "nl_NL", careerjetLocation: "Nederland",       careerjetSiteUrl: "https://www.careerjet.nl/" },
  "france":              { indeedDomain: "fr.indeed.com",    indeedLocation: "France",              careerjetLocale: "fr_FR", careerjetLocation: "France",          careerjetSiteUrl: "https://www.careerjet.fr/" },
  "australia":           { indeedDomain: "au.indeed.com",    indeedLocation: "Australia",           careerjetLocale: "en_AU", careerjetLocation: "Australia",       careerjetSiteUrl: "https://www.careerjet.com.au/" },
  "india":               { indeedDomain: "indeed.co.in",     indeedLocation: "India",               careerjetLocale: "en_IN", careerjetLocation: "India",           careerjetSiteUrl: "https://www.careerjet.co.in/" },
  "singapore":           { indeedDomain: "sg.indeed.com",    indeedLocation: "Singapore",           careerjetLocale: "en_SG", careerjetLocation: "Singapore",       careerjetSiteUrl: "https://www.careerjet.sg/" },
  "japan":               { indeedDomain: "jp.indeed.com",    indeedLocation: "Japan",               careerjetLocale: "ja_JP", careerjetLocation: "Japan",           careerjetSiteUrl: "https://www.careerjet.jp/" },
  "south korea":         { indeedDomain: "kr.indeed.com",    indeedLocation: "South Korea",         careerjetLocale: "ko_KR", careerjetLocation: "South Korea",     careerjetSiteUrl: "https://www.careerjet.co.kr/" },
  "brazil":              { indeedDomain: "indeed.com.br",    indeedLocation: "Brasil",              careerjetLocale: "pt_BR", careerjetLocation: "Brasil",          careerjetSiteUrl: "https://www.careerjet.com.br/" },
  "mexico":              { indeedDomain: "indeed.com.mx",    indeedLocation: "México",              careerjetLocale: "es_MX", careerjetLocation: "México",          careerjetSiteUrl: "https://www.careerjet.com.mx/" },
  "spain":               { indeedDomain: "es.indeed.com",    indeedLocation: "España",              careerjetLocale: "es_ES", careerjetLocation: "España",          careerjetSiteUrl: "https://www.careerjet.es/" },
  "italy":               { indeedDomain: "it.indeed.com",    indeedLocation: "Italia",              careerjetLocale: "it_IT", careerjetLocation: "Italia",          careerjetSiteUrl: "https://www.careerjet.it/" },
  "sweden":              { indeedDomain: "se.indeed.com",    indeedLocation: "Sverige",             careerjetLocale: "sv_SE", careerjetLocation: "Sverige",         careerjetSiteUrl: "https://www.careerjet.se/" },
  "switzerland":         { indeedDomain: "indeed.ch",        indeedLocation: "Schweiz",             careerjetLocale: "de_CH", careerjetLocation: "Schweiz",         careerjetSiteUrl: "https://www.careerjet.ch/" },
  "poland":              { indeedDomain: "pl.indeed.com",    indeedLocation: "Polska",              careerjetLocale: "pl_PL", careerjetLocation: "Polska",          careerjetSiteUrl: "https://www.careerjet.pl/" },
  "israel":              { indeedDomain: "il.indeed.com",    indeedLocation: "Israel",              careerjetLocale: "en_IL", careerjetLocation: "Israel",          careerjetSiteUrl: "https://www.careerjet.co.il/" },
  "united arab emirates":{ indeedDomain: "indeed.ae",        indeedLocation: "UAE",                 careerjetLocale: "en_AE", careerjetLocation: "UAE",             careerjetSiteUrl: "https://www.careerjet.ae/" },
  "south africa":        { indeedDomain: "za.indeed.com",    indeedLocation: "South Africa",        careerjetLocale: "en_ZA", careerjetLocation: "South Africa",    careerjetSiteUrl: "https://www.careerjet.co.za/" },
  "new zealand":         { indeedDomain: "nz.indeed.com",    indeedLocation: "New Zealand",         careerjetLocale: "en_NZ", careerjetLocation: "New Zealand",     careerjetSiteUrl: "https://www.careerjet.co.nz/" },
};

const DEFAULT_LOCATION: LocationConfig = {
  indeedDomain: "indeed.com",
  indeedLocation: "",
  careerjetLocale: "en",
  careerjetLocation: "",
  careerjetSiteUrl: "https://www.careerjet.com/",
};

/** Resolved at pipeline startup after profile is fetched */
let _locationConfig: LocationConfig = DEFAULT_LOCATION;

export function setUserLocation(country: string) {
  _locationConfig = LOCATION_MAP[country.toLowerCase()] || DEFAULT_LOCATION;
}

export function getLocationConfig(): LocationConfig {
  return _locationConfig;
}

export function getRemotiveCategories(): string[] {
  const keywords = config.SEARCH_KEYWORDS.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const categories = new Set<string>();
  for (const kw of keywords) {
    const cat = KEYWORD_TO_REMOTIVE[kw];
    if (cat) categories.add(cat);
  }
  return categories.size > 0 ? [...categories] : ["software-dev"];
}
