import { Router, Request, Response } from "express";
import db from "../db";

const router = Router();

/** Read all pipeline settings from DB as a key-value map */
function readSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM pipeline_settings").all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

// ─── GET /api/settings ───────────────────────────────────────────────
router.get("/", (_req: Request, res: Response) => {
  const s = readSettings();

  res.json({
    config: {
      RELEVANCE_SCORE_THRESHOLD: parseInt(s.RELEVANCE_SCORE_THRESHOLD || "5", 10),
      TAILORING_INTENSITY: parseInt(s.TAILORING_INTENSITY || "5", 10),
      APIFY_JOB_COUNT: parseInt(s.APIFY_JOB_COUNT || "100", 10),
      BATCH_DELAY_MS: parseInt(s.BATCH_DELAY_MS || "2000", 10),
      APIFY_MAX_POLL_MINUTES: parseInt(s.APIFY_MAX_POLL_MINUTES || "10", 10),
      MAX_JOBS_TEST_LIMIT: parseInt(s.MAX_JOBS_TEST_LIMIT || "0", 10),
      SEARCH_KEYWORDS: s.SEARCH_KEYWORDS || "",
      TARGET_COUNTRIES: s.TARGET_COUNTRIES || "",
      LINKEDIN_SEARCH_URL: s.LINKEDIN_SEARCH_URL || "",
      MAX_AGE_DAYS: parseInt(s.MAX_AGE_DAYS || "14", 10),
      JOB_LEVELS: s.JOB_LEVELS || "",
      MAX_REQ_YOE: parseInt(s.MAX_REQ_YOE || "0", 10),
      RESUME_ORDER: s.RESUME_ORDER || "summary,experience,skills,projects,education",
      SCRAPE_REMOTEOK: s.SCRAPE_REMOTEOK === "true",
      SCRAPE_JOBICY: s.SCRAPE_JOBICY === "true",
      SCRAPE_HN: s.SCRAPE_HN === "true",
      SCRAPE_WWR: s.SCRAPE_WWR === "true",
      SCRAPE_ARBEITNOW: s.SCRAPE_ARBEITNOW === "true",
      SCRAPE_REMOTIVE: s.SCRAPE_REMOTIVE === "true",
      SCRAPE_DEVTO: s.SCRAPE_DEVTO === "true",
      SCRAPE_CAREERJET: s.SCRAPE_CAREERJET === "true",
      SCRAPE_GLASSDOOR: s.SCRAPE_GLASSDOOR === "true",
      SCRAPE_INDEED: s.SCRAPE_INDEED === "true",
      SCRAPE_SIMPLIFY: s.SCRAPE_SIMPLIFY === "true",
      SCRAPE_NAUKRI: s.SCRAPE_NAUKRI === "true",
      SCRAPE_ASHBY: s.SCRAPE_ASHBY === "true",
      SCRAPE_LEVER: s.SCRAPE_LEVER === "true",
      SCRAPE_GREENHOUSE: s.SCRAPE_GREENHOUSE === "true",
    },
  });
});

// ─── PUT /api/settings ───────────────────────────────────────────────
router.put("/", (req: Request, res: Response) => {
  const updates = req.body;
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const upsert = db.prepare(
    "INSERT INTO pipeline_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );

  let changed = 0;
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, String(value));
      changed++;
    }
  });
  tx();

  res.json({ ok: true, changed });
});

export default router;
