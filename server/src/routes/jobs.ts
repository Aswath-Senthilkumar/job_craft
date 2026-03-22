import { Router, Request, Response } from "express";
import {
  getAllJobs, getJobById, jobExistsByLink, jobExistsByTitleCompany,
  upsertJob, updateJob, deleteJob, deleteJobsBatch,
} from "../db-adapter";

const router = Router();

// GET /api/jobs/exists?job_link=<url>&job_title=<t>&company_name=<c> — duplicate check for pipeline
router.get("/exists", async (req: Request, res: Response) => {
  const { job_link, job_title, company_name } = req.query;

  if (job_link && typeof job_link === "string") {
    const existing = await jobExistsByLink(job_link, req.insforgeClient);
    if (existing) {
      res.json({ exists: true, id: existing.id });
      return;
    }
  }

  if (job_title && company_name && typeof job_title === "string" && typeof company_name === "string") {
    const existing = await jobExistsByTitleCompany(job_title, company_name, req.insforgeClient);
    if (existing) {
      res.json({ exists: true, id: existing.id });
      return;
    }
  }

  res.json({ exists: false });
});

// GET /api/jobs — list all jobs, optionally filtered by status
router.get("/", async (req: Request, res: Response) => {
  const { status } = req.query;
  const jobs = await getAllJobs(status && typeof status === "string" ? status : undefined, req.insforgeClient);
  res.json(jobs);
});

// GET /api/jobs/:id — get a single job
router.get("/:id", async (req: Request, res: Response) => {
  const job = await getJobById(req.params.id, req.insforgeClient);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

// POST /api/jobs — create a new job (called by pipeline)
router.post("/", async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object") {
    console.error("[POST /api/jobs] Empty or invalid request body");
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { job_title, company_name } = req.body;

  if (!job_title || !company_name) {
    console.error(`[POST /api/jobs] Missing required fields — job_title: "${job_title}", company_name: "${company_name}"`);
    res.status(400).json({ error: `job_title and company_name are required (got job_title=${JSON.stringify(job_title)}, company_name=${JSON.stringify(company_name)})` });
    return;
  }

  try {
    const { job, created } = await upsertJob(req.body, req.insforgeClient, req.userId);
    res.status(created ? 201 : 200).json(job);
  } catch (err: any) {
    console.error(`[POST /api/jobs] DB error: ${err.message}`);
    res.status(500).json({ error: "Database error" });
  }
});

// PATCH /api/jobs/:id — update job (status, notes, etc.)
router.patch("/:id", async (req: Request, res: Response) => {
  const existing = await getJobById(req.params.id, req.insforgeClient);
  if (!existing) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const updated = await updateJob(req.params.id, req.body, req.insforgeClient);
  if (!updated) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  // Auto-trigger interview prep when a job moves to "interviewing"
  if (updated.status === "interviewing" && existing.status !== "interviewing") {
    const { triggerPrepIfNew } = require("../services/prep-generator");
    triggerPrepIfNew(req.params.id, req.insforgeClient).catch((err: any) => {
      console.error(`[jobs PATCH] Prep trigger failed: ${err.message}`);
    });
  }

  res.json(updated);
});

// DELETE /api/jobs/batch — batch delete by array of ids
router.delete("/batch", async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array" });
    return;
  }
  const deleted = await deleteJobsBatch(ids, req.insforgeClient);
  res.json({ deleted });
});

// DELETE /api/jobs/:id — delete a job
router.delete("/:id", async (req: Request, res: Response) => {
  const success = await deleteJob(req.params.id, req.insforgeClient);
  if (!success) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
