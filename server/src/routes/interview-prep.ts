import { Router, Request, Response } from "express";
import {
  getInterviewPrep,
  upsertInterviewPrep,
  updateInterviewPrep,
  getJobById,
} from "../db-adapter";
import { generateInterviewPrep, triggerPrepIfNew } from "../services/prep-generator";

const router = Router();

// GET /api/interview-prep/view/:filename — proxy route for inline PDF viewing
// Must be defined BEFORE /:jobId to avoid capture by the param route
router.get("/view/:filename", async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    const userId = req.userId;
    if (!userId) throw new Error("Unauthorized");

    const ossHost = process.env.INSFORGE_BASE_URL;
    if (!ossHost) throw new Error("INSFORGE_BASE_URL not configured");

    const publicUrl = `${ossHost}/api/storage/buckets/resumes/objects/${userId}%2F${encodeURIComponent(filename)}`;
    const response = await fetch(publicUrl);
    if (!response.ok) throw new Error(`Storage returned ${response.status}`);

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error("[interview-prep /view]", err.message);
    res.status(404).send("File not found or access denied");
  }
});

// GET /api/interview-prep/:jobId — get prep status and document URLs
router.get("/:jobId", async (req: Request, res: Response) => {
  try {
    const jobId = Number(req.params.jobId);
    if (isNaN(jobId)) { res.status(400).json({ error: "Invalid jobId" }); return; }

    const prep = await getInterviewPrep(jobId, req.insforgeClient);
    if (!prep) { res.json({ status: "none" }); return; }

    const wr = prep.web_research || {};
    const hasMarkdown = !!(wr._intel_markdown && wr._prep_markdown);

    res.json({
      status: prep.status,
      prepId: prep.id,
      intelReportUrl: prep.intel_report_url || null,
      prepGuideUrl: prep.prep_guide_url || null,
      hasMarkdownFallback: hasMarkdown,
      intelMarkdown: hasMarkdown ? wr._intel_markdown : null,
      prepMarkdown: hasMarkdown ? wr._prep_markdown : null,
      errorMessage: prep.error_message || null,
      createdAt: prep.created_at,
      updatedAt: prep.updated_at,
    });
  } catch (err: any) {
    console.error("[interview-prep GET /:jobId]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/interview-prep/:jobId/generate — kick off async prep generation
router.post("/:jobId/generate", async (req: Request, res: Response) => {
  try {
    const jobId = Number(req.params.jobId);
    if (isNaN(jobId)) { res.status(400).json({ error: "Invalid jobId" }); return; }

    const job = await getJobById(jobId, req.insforgeClient);
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.status !== "interviewing") {
      res.status(400).json({ error: "Job must be in Interviewing status to generate prep materials" });
      return;
    }

    const existing = await getInterviewPrep(jobId, req.insforgeClient);

    if (existing?.status === "completed") {
      const wr = existing.web_research || {};
      res.json({
        status: "completed",
        prepId: existing.id,
        intelReportUrl: existing.intel_report_url || null,
        prepGuideUrl: existing.prep_guide_url || null,
        hasMarkdownFallback: !!(wr._intel_markdown && wr._prep_markdown),
      });
      return;
    }

    if (existing?.status === "generating") {
      res.json({ status: "generating", prepId: existing.id });
      return;
    }

    const { data: user } = await req.insforgeClient.auth.getCurrentUser();
    const userId = user?.user?.id;

    let prepId: number;
    if (existing) {
      await updateInterviewPrep(existing.id, { status: "generating", error_message: null }, req.insforgeClient);
      prepId = existing.id;
    } else {
      const row = await upsertInterviewPrep(jobId, { status: "generating" }, req.insforgeClient, userId);
      prepId = row.id;
    }

    generateInterviewPrep(jobId, req.insforgeClient, prepId).catch((err: any) => {
      console.error(`[interview-prep] Background error: ${err.message}`);
    });

    res.json({ status: "generating", prepId });
  } catch (err: any) {
    console.error("[interview-prep POST /generate]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/interview-prep/:jobId/regenerate — force full regeneration
router.post("/:jobId/regenerate", async (req: Request, res: Response) => {
  try {
    const jobId = Number(req.params.jobId);
    if (isNaN(jobId)) { res.status(400).json({ error: "Invalid jobId" }); return; }

    const existing = await getInterviewPrep(jobId, req.insforgeClient);
    const { data: user } = await req.insforgeClient.auth.getCurrentUser();
    const userId = user?.user?.id;

    let prepId: number;
    if (existing) {
      await updateInterviewPrep(existing.id, {
        status: "generating",
        error_message: null,
        intel_report_url: null,
        prep_guide_url: null,
        web_research: null,
        email_context: null,
      }, req.insforgeClient);
      prepId = existing.id;
    } else {
      const row = await upsertInterviewPrep(jobId, { status: "generating" }, req.insforgeClient, userId);
      prepId = row.id;
    }

    generateInterviewPrep(jobId, req.insforgeClient, prepId).catch((err: any) => {
      console.error(`[interview-prep] Regen error: ${err.message}`);
    });

    res.json({ status: "generating", prepId });
  } catch (err: any) {
    console.error("[interview-prep POST /regenerate]", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
