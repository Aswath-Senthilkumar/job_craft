import { Router, Request, Response } from "express";
import db from "../db";

const router = Router();

// GET /api/skills/trend — last N snapshots (default 30)
router.get("/trend", (req: Request, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || "30", 10), 90);
  const rows = db
    .prepare("SELECT date, total_jobs, skills_json FROM skill_snapshots ORDER BY date DESC LIMIT ?")
    .all(limit) as { date: string; total_jobs: number; skills_json: string }[];

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
router.post("/snapshot", (req: Request, res: Response) => {
  const { date, total_jobs, skills } = req.body;
  if (!date || !skills) {
    res.status(400).json({ error: "date and skills are required" });
    return;
  }

  // Upsert by date
  const existing = db.prepare("SELECT id FROM skill_snapshots WHERE date = ?").get(date);
  if (existing) {
    db.prepare("UPDATE skill_snapshots SET total_jobs = ?, skills_json = ? WHERE date = ?")
      .run(total_jobs || 0, JSON.stringify(skills), date);
  } else {
    db.prepare("INSERT INTO skill_snapshots (date, total_jobs, skills_json) VALUES (?, ?, ?)")
      .run(date, total_jobs || 0, JSON.stringify(skills));
  }

  res.json({ ok: true });
});

/**
 * GET /api/skills/current — top skills from processed jobs (uses pre-extracted jd_keywords)
 * Query params:
 *   - role: filter by job title keyword (e.g. "software engineer", "analyst")
 *   - location: filter by location keyword (e.g. "dublin", "remote")
 */
router.get("/current", (req: Request, res: Response) => {
  const role = (req.query.role as string) || "";
  const location = (req.query.location as string) || "";

  let query = "SELECT jd_keywords, resume_keywords FROM jobs WHERE jd_keywords IS NOT NULL AND jd_keywords != ''";
  const params: string[] = [];

  if (role) {
    query += " AND LOWER(job_title) LIKE ?";
    params.push(`%${role.toLowerCase()}%`);
  }
  if (location) {
    query += " AND LOWER(location) LIKE ?";
    params.push(`%${location.toLowerCase()}%`);
  }

  const jobs = db.prepare(query).all(...params) as { jd_keywords: string; resume_keywords: string | null }[];

  const skillFreq: Record<string, number> = {};
  const resumeSkillSet = new Set<string>();

  for (const job of jobs) {
    // Aggregate JD skills
    try {
      const jdSkills: string[] = JSON.parse(job.jd_keywords);
      for (const skill of jdSkills) {
        const key = skill.toLowerCase();
        skillFreq[key] = (skillFreq[key] || 0) + 1;
      }
    } catch {}

    // Collect resume skills
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
router.get("/filters", (_req: Request, res: Response) => {
  // Extract distinct role keywords from processed job titles
  const titleRows = db.prepare(
    "SELECT LOWER(job_title) as title, COUNT(*) as cnt FROM jobs WHERE jd_keywords IS NOT NULL GROUP BY LOWER(job_title) ORDER BY cnt DESC"
  ).all() as { title: string; cnt: number }[];

  // Group similar titles by extracting the core role (first meaningful phrase)
  const roleMap = new Map<string, number>();
  for (const row of titleRows) {
    // Use the full title as the filter value — no hardcoded patterns
    const label = row.title.trim();
    if (label) {
      roleMap.set(label, (roleMap.get(label) || 0) + row.cnt);
    }
  }

  const roles = Array.from(roleMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([role, count]) => ({ label: role.replace(/\b\w/g, c => c.toUpperCase()), value: role, count }));

  // Get distinct locations from processed jobs
  const locRows = db.prepare(
    "SELECT location, COUNT(*) as cnt FROM jobs WHERE jd_keywords IS NOT NULL AND location IS NOT NULL AND location != '' GROUP BY LOWER(location) ORDER BY cnt DESC LIMIT 50"
  ).all() as { location: string; cnt: number }[];

  const locations = locRows.map(r => ({ label: r.location, value: r.location.toLowerCase(), count: r.cnt }));

  res.json({ roles, locations });
});

// POST /api/skills/archive — bulk insert scraped jobs into the archive (called by pipeline)
router.post("/archive", (req: Request, res: Response) => {
  const { jobs } = req.body;
  if (!Array.isArray(jobs)) {
    res.status(400).json({ error: "jobs must be an array" });
    return;
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO scraped_jobs_archive (job_title, company_name, location, description, source, content_hash)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const job of jobs) {
      if (!job.title || !job.companyName) continue;
      const result = insert.run(
        job.title,
        job.companyName,
        job.location || null,
        job.description || null,
        job.source || null,
        job.contentHash || null
      );
      if (result.changes > 0) inserted++;
    }
  });

  tx();

  // Retention: delete archive entries older than 180 days
  const cutoff = new Date(Date.now() - 180 * 86400000).toISOString();
  const pruned = db.prepare("DELETE FROM scraped_jobs_archive WHERE scraped_at < ?").run(cutoff);
  const prunedCount = pruned.changes;

  res.json({ inserted, total: jobs.length, pruned: prunedCount });
});

export default router;
