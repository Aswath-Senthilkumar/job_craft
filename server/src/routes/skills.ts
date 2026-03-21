import { Router, Request, Response } from "express";
import {
  getSkillSnapshots, upsertSkillSnapshot, getJobsWithKeywords,
  getJobTitleCounts, getJobLocationCounts, archiveJobs,
} from "../db-adapter";

const router = Router();

// GET /api/skills/trend — last N snapshots (default 30)
router.get("/trend", async (req: Request, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || "30", 10), 90);
  const rows = await getSkillSnapshots(limit, req.insforgeClient);

  const snapshots = rows.map((r) => {
    let skills = {};
    try { skills = JSON.parse(r.skills_json || "{}"); } catch (e) {
      console.error(`[Skills] Corrupted skills_json for date ${r.date}`);
    }
    return { date: r.date, total_jobs: r.total_jobs, skills };
  });

  res.json({ snapshots: snapshots.reverse() });
});

// POST /api/skills/snapshot — called by pipeline after each run to record skill frequencies
router.post("/snapshot", async (req: Request, res: Response) => {
  const { date, total_jobs, skills } = req.body;
  if (!date || !skills) {
    res.status(400).json({ error: "date and skills are required" });
    return;
  }

  await upsertSkillSnapshot(date, total_jobs || 0, skills, req.insforgeClient, req.userId);
  res.json({ ok: true });
});

/**
 * GET /api/skills/current — top skills from processed jobs (uses pre-extracted jd_keywords)
 */
router.get("/current", async (req: Request, res: Response) => {
  const role = (req.query.role as string) || "";
  const location = (req.query.location as string) || "";

  const jobs = await getJobsWithKeywords(role || undefined, location || undefined, req.insforgeClient);

  const skillFreq: Record<string, number> = {};
  const resumeSkillSet = new Set<string>();

  for (const job of jobs) {
    try {
      const jdSkills: string[] = JSON.parse(job.jd_keywords);
      for (const skill of jdSkills) {
        const key = skill.toLowerCase();
        skillFreq[key] = (skillFreq[key] || 0) + 1;
      }
    } catch {}

    if (job.resume_keywords) {
      try {
        const rSkills: string[] = JSON.parse(job.resume_keywords);
        for (const s of rSkills) resumeSkillSet.add(s.toLowerCase());
      } catch {}
    }
  }

  const totalJobs = jobs.length;
  const sorted = Object.entries(skillFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([skill, count]) => ({
      skill,
      count,
      pct: Math.round((count / Math.max(totalJobs, 1)) * 100),
      onResume: resumeSkillSet.has(skill),
    }));

  res.json({ total_jobs: totalJobs, skills: sorted, resume_skills: Array.from(resumeSkillSet) });
});

// GET /api/skills/filters — get available job roles and locations from processed jobs
router.get("/filters", async (req: Request, res: Response) => {
  const titleRows = await getJobTitleCounts(req.insforgeClient);

  const roles = titleRows
    .slice(0, 50)
    .map((r: any) => ({ label: r.title.replace(/\b\w/g, (c: string) => c.toUpperCase()), value: r.title, count: r.cnt }));

  const locRows = await getJobLocationCounts(req.insforgeClient);
  const locations = locRows.map((r: any) => ({ label: r.location, value: r.location.toLowerCase(), count: r.cnt }));

  res.json({ roles, locations });
});

// POST /api/skills/archive — bulk insert scraped jobs into the archive (called by pipeline)
router.post("/archive", async (req: Request, res: Response) => {
  const { jobs } = req.body;
  if (!Array.isArray(jobs)) {
    res.status(400).json({ error: "jobs must be an array" });
    return;
  }

  const { inserted, pruned } = await archiveJobs(jobs, req.insforgeClient, req.userId);
  res.json({ inserted, total: jobs.length, pruned });
});

export default router;
