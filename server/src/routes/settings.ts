import { Router, Request, Response } from "express";
import { getAllSettings, upsertSettings } from "../db-adapter";

const router = Router();

// ─── GET /api/settings ───────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const s = await getAllSettings(req.insforgeClient);

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
      MAX_REQ_YOE: parseInt(s.MAX_REQ_YOE ?? "-1", 10),
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
router.put("/", async (req: Request, res: Response) => {
  const updates = req.body;
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const changed = await upsertSettings(updates, req.insforgeClient, req.userId);
  res.json({ ok: true, changed });
});

export default router;
