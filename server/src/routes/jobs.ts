import { Router, Request, Response } from "express";
import db from "../db";

const router = Router();

// GET /api/jobs/exists?job_link=<url>&job_title=<t>&company_name=<c> — duplicate check for pipeline
// Matches by job_link OR by (job_title + company_name) to catch same role posted for multiple locations
router.get("/exists", (req: Request, res: Response) => {
  const { job_link, job_title, company_name } = req.query;

  // Check by job_link first
  if (job_link && typeof job_link === "string") {
    const existing = db.prepare("SELECT id FROM jobs WHERE job_link = ?").get(job_link) as { id: number } | undefined;
    if (existing) {
      res.json({ exists: true, id: existing.id });
      return;
    }
  }

  // Check by title + company (catches same role across different locations)
  if (job_title && company_name && typeof job_title === "string" && typeof company_name === "string") {
    const existing = db.prepare(
      "SELECT id FROM jobs WHERE LOWER(job_title) = LOWER(?) AND LOWER(company_name) = LOWER(?)"
    ).get(job_title.trim(), company_name.trim()) as { id: number } | undefined;
    if (existing) {
      res.json({ exists: true, id: existing.id });
      return;
    }
  }

  res.json({ exists: false });
});

// GET /api/jobs — list all jobs, optionally filtered by status
router.get("/", (req: Request, res: Response) => {
  const { status } = req.query;
  let jobs;
  if (status && typeof status === "string") {
    jobs = db
      .prepare("SELECT * FROM jobs WHERE status = ? ORDER BY updated_at DESC")
      .all(status);
  } else {
    jobs = db
      .prepare("SELECT * FROM jobs ORDER BY updated_at DESC")
      .all();
  }
  res.json(jobs);
});

// GET /api/jobs/:id — get a single job
router.get("/:id", (req: Request, res: Response) => {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

// POST /api/jobs — create a new job (called by n8n)
router.post("/", (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object") {
    console.error("[POST /api/jobs] Empty or invalid request body");
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const {
    job_title,
    company_name,
    company_url,
    job_link,
    location,
    salary,
    seniority_level,
    applicants_count,
    apply_url,
    resume_url,
    outreach_email,
    description,
    status = "applied",
    match_score,
    match_reason,
    applied_date,
    notes,
    deadline,
    job_category,
    interview_date,
    offer_date,
    source,
    sources,
    source_count,
    content_hash,
    posted_at,
    freshness_score,
    tags,
    resume_keywords,
    jd_keywords,
    matched_keywords,
    added_keywords,
    missing_keywords,
    resume_data,
  } = req.body;

  if (!job_title || !company_name) {
    console.error(`[POST /api/jobs] Missing required fields — job_title: "${job_title}", company_name: "${company_name}"`);
    res.status(400).json({ error: `job_title and company_name are required (got job_title=${JSON.stringify(job_title)}, company_name=${JSON.stringify(company_name)})` });
    return;
  }

  try {
    // Atomic upsert using INSERT ... ON CONFLICT to prevent race conditions
    const result = db
      .prepare(
        `INSERT INTO jobs (
          job_title, company_name, company_url, job_link, location, salary,
          seniority_level, applicants_count, apply_url, resume_url, outreach_email,
          description, status, match_score, match_reason, applied_date, notes, deadline, job_category,
          interview_date, offer_date,
          source, sources, source_count, content_hash, posted_at, freshness_score, tags,
          resume_keywords, jd_keywords, matched_keywords, added_keywords, missing_keywords,
          resume_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_link) DO UPDATE SET
          job_title = excluded.job_title,
          company_name = excluded.company_name,
          company_url = excluded.company_url,
          location = excluded.location,
          salary = excluded.salary,
          seniority_level = excluded.seniority_level,
          applicants_count = excluded.applicants_count,
          apply_url = excluded.apply_url,
          resume_url = COALESCE(excluded.resume_url, resume_url),
          outreach_email = COALESCE(excluded.outreach_email, outreach_email),
          description = COALESCE(excluded.description, description),
          status = excluded.status,
          match_score = excluded.match_score,
          match_reason = COALESCE(excluded.match_reason, match_reason),
          applied_date = excluded.applied_date,
          deadline = COALESCE(excluded.deadline, deadline),
          job_category = COALESCE(excluded.job_category, job_category),
          interview_date = COALESCE(excluded.interview_date, interview_date),
          offer_date = COALESCE(excluded.offer_date, offer_date),
          source = COALESCE(excluded.source, source),
          sources = COALESCE(excluded.sources, sources),
          source_count = COALESCE(excluded.source_count, source_count),
          content_hash = COALESCE(excluded.content_hash, content_hash),
          posted_at = COALESCE(excluded.posted_at, posted_at),
          freshness_score = COALESCE(excluded.freshness_score, freshness_score),
          tags = COALESCE(excluded.tags, tags),
          resume_keywords = COALESCE(excluded.resume_keywords, resume_keywords),
          jd_keywords = COALESCE(excluded.jd_keywords, jd_keywords),
          matched_keywords = COALESCE(excluded.matched_keywords, matched_keywords),
          added_keywords = COALESCE(excluded.added_keywords, added_keywords),
          missing_keywords = COALESCE(excluded.missing_keywords, missing_keywords),
          resume_data = COALESCE(excluded.resume_data, resume_data),
          updated_at = datetime('now')`
      )
      .run(
        job_title, company_name, company_url, job_link, location, salary,
        seniority_level, applicants_count, apply_url, resume_url, outreach_email,
        description, status, match_score, match_reason ?? null,
        applied_date || new Date().toISOString().split("T")[0],
        notes, deadline ?? null, job_category ?? null,
        interview_date ?? null, offer_date ?? null,
        source ?? "linkedin", sources ?? null, source_count ?? 1,
        content_hash ?? null, posted_at ?? null, freshness_score ?? null, tags ?? null,
        resume_keywords ?? null, jd_keywords ?? null, matched_keywords ?? null, added_keywords ?? null, missing_keywords ?? null,
        resume_data ?? null
      );

    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(
      result.changes > 0 && result.lastInsertRowid ? result.lastInsertRowid
        : (db.prepare("SELECT id FROM jobs WHERE job_link = ?").get(job_link) as any)?.id ?? result.lastInsertRowid
    );
    res.status(result.changes > 0 ? 201 : 200).json(job);
  } catch (err: any) {
    console.error(`[POST /api/jobs] DB error: ${err.message}`);
    res.status(500).json({ error: "Database error" });
  }
});

// PATCH /api/jobs/:id — update job (status, notes, etc.)
router.patch("/:id", (req: Request, res: Response) => {
  const existing = db.prepare("SELECT * FROM jobs WHERE id = ?").get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const allowedFields = [
    "job_title", "company_name", "company_url", "job_link", "location",
    "salary", "seniority_level", "applicants_count", "apply_url", "resume_url",
    "outreach_email", "description", "status", "match_score", "match_reason", "applied_date", "notes",
    "deadline", "job_category", "interview_date", "offer_date",
    "source", "sources", "source_count", "content_hash", "posted_at", "freshness_score", "tags",
    "resume_keywords", "jd_keywords", "matched_keywords", "added_keywords", "missing_keywords",
    "resume_data",
  ];

  const updates: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);

  db.prepare(`UPDATE jobs SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare("SELECT * FROM jobs WHERE id = ?").get(req.params.id);
  res.json(updated);
});

// DELETE /api/jobs/batch — batch delete by array of ids
router.delete("/batch", (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array" });
    return;
  }
  const placeholders = ids.map(() => "?").join(",");
  const result = db.prepare(`DELETE FROM jobs WHERE id IN (${placeholders})`).run(...ids);
  res.json({ deleted: result.changes });
});

// DELETE /api/jobs/:id — delete a job
router.delete("/:id", (req: Request, res: Response) => {
  const result = db.prepare("DELETE FROM jobs WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
