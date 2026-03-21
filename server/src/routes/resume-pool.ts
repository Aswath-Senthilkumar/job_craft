import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { poolDb as db } from "../db";

// ── Skill extraction (mirrors pipeline/src/services/skill-matcher.ts) ─────────

interface SkillEntry { canonical: string; aliases: string[] }

// Maps dictionary subcategories → resume skill categories
const SKILL_CATEGORY_MAP: Record<string, string> = {
  languages: "languages",
  frontend_frameworks: "frameworks", backend_frameworks: "frameworks",
  databases: "dataAndMiddleware", messaging_streaming: "dataAndMiddleware",
  data_engineering: "dataAndMiddleware", data_analytics_bi: "dataAndMiddleware",
  cloud_platforms: "cloudAndDevops", cloud_services: "cloudAndDevops",
  devops_tools: "cloudAndDevops", monitoring_observability: "cloudAndDevops",
  testing: "testingAndTools", version_control: "testingAndTools",
  api_protocols: "testingAndTools", security: "testingAndTools",
  project_management: "testingAndTools", operating_systems: "testingAndTools",
  ml_ai: "frameworks", erp_crm: "testingAndTools",
};

let skillPhrases: { phrase: string; canonical: string }[] | null = null;
let skillCategoryLookup: Map<string, string> | null = null;

function loadSkillPhrases() {
  if (skillPhrases) return skillPhrases;
  const dictPath = path.join(__dirname, "../../../pipeline/src/data/skills-dictionary.json");
  let raw: Record<string, any>;
  try { raw = JSON.parse(fs.readFileSync(dictPath, "utf-8")); }
  catch { skillPhrases = []; skillCategoryLookup = new Map(); return skillPhrases; }
  const phrases: { phrase: string; canonical: string }[] = [];
  const catLookup = new Map<string, string>();
  for (const [category, subcats] of Object.entries(raw)) {
    if (category === "_meta") continue;
    for (const [subcat, entries] of Object.entries(subcats as Record<string, SkillEntry[]>)) {
      const resumeCat = SKILL_CATEGORY_MAP[subcat] || "testingAndTools";
      for (const entry of entries) {
        catLookup.set(entry.canonical.toLowerCase(), resumeCat);
        for (const form of [entry.canonical, ...entry.aliases]) {
          const lower = form.toLowerCase().trim();
          if (lower) phrases.push({ phrase: lower, canonical: entry.canonical });
        }
      }
    }
  }
  // Longest first for greedy matching
  skillCategoryLookup = catLookup;
  skillPhrases = phrases.sort((a, b) => b.phrase.length - a.phrase.length);
  return skillPhrases;
}

function categorizeSkills(skills: string[]): Record<string, string> {
  loadSkillPhrases();
  const cats: Record<string, Set<string>> = {
    languages: new Set(), frameworks: new Set(),
    dataAndMiddleware: new Set(), cloudAndDevops: new Set(), testingAndTools: new Set(),
  };
  for (const skill of skills) {
    const cat = skillCategoryLookup?.get(skill.toLowerCase()) || "testingAndTools";
    cats[cat].add(skill);
  }
  return {
    languages: Array.from(cats.languages).join(", "),
    frameworks: Array.from(cats.frameworks).join(", "),
    dataAndMiddleware: Array.from(cats.dataAndMiddleware).join(", "),
    cloudAndDevops: Array.from(cats.cloudAndDevops).join(", "),
    testingAndTools: Array.from(cats.testingAndTools).join(", "),
  };
}

function extractSkillsFromText(text: string): string[] {
  const phrases = loadSkillPhrases();
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const { phrase, canonical } of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    const regex = phrase.length <= 2
      ? new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z#\\+])`, "i")
      : new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(lower)) found.add(canonical);
  }
  return Array.from(found);
}

const router = Router();

function parseJson(str: string, fallback: any) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ── Profile ───────────────────────────────────────────────────────────────────

router.get("/profile", (_req: Request, res: Response) => {
  const profile = db.prepare("SELECT * FROM resume_profile WHERE id = 1").get() as any;
  res.json(profile || { name: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" });
});

router.put("/profile", (req: Request, res: Response) => {
  const { name = "", email = "", phone = "", location = "", linkedin = "", github = "", portfolio = "" } = req.body;
  db.prepare(`
    INSERT INTO resume_profile (id, name, email, phone, location, linkedin, github, portfolio, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, email = excluded.email, phone = excluded.phone,
      location = excluded.location, linkedin = excluded.linkedin, github = excluded.github,
      portfolio = excluded.portfolio, updated_at = datetime('now')
  `).run(name, email, phone, location, linkedin, github, portfolio);
  res.json({ ok: true });
});

// ── Experiences ───────────────────────────────────────────────────────────────

router.get("/experiences", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM resume_experiences ORDER BY sort_order ASC, id ASC").all() as any[];
  res.json(rows.map(r => ({ ...r, skills_used: parseJson(r.skills_used, []) })));
});

router.post("/experiences", (req: Request, res: Response) => {
  const { company, title, location = "", start_date = "", end_date = null, summary = "", description = "", skills_used = [], sort_order = 0 } = req.body;
  if (!company || !title) return res.status(400).json({ error: "company and title required" });
  const result = db.prepare(`
    INSERT INTO resume_experiences (company, title, location, start_date, end_date, summary, description, skills_used, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(company, title, location, start_date, end_date, summary, description, JSON.stringify(skills_used), sort_order);
  const row = db.prepare("SELECT * FROM resume_experiences WHERE id = ?").get(result.lastInsertRowid) as any;
  res.json({ ...row, skills_used: parseJson(row.skills_used, []) });
});

router.put("/experiences/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM resume_experiences WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { company, title, location, start_date, end_date, summary, description, skills_used, sort_order } = req.body;
  db.prepare(`
    UPDATE resume_experiences SET
      company = ?, title = ?, location = ?, start_date = ?, end_date = ?,
      summary = ?, description = ?, skills_used = ?, sort_order = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    company ?? existing.company, title ?? existing.title,
    location ?? existing.location, start_date ?? existing.start_date,
    end_date !== undefined ? end_date : existing.end_date,
    summary ?? existing.summary ?? "",
    description ?? existing.description,
    skills_used !== undefined ? JSON.stringify(skills_used) : existing.skills_used,
    sort_order ?? existing.sort_order, id
  );
  const updated = db.prepare("SELECT * FROM resume_experiences WHERE id = ?").get(id) as any;
  res.json({ ...updated, skills_used: parseJson(updated.skills_used, []) });
});

router.delete("/experiences/:id", (req: Request, res: Response) => {
  db.prepare("DELETE FROM resume_experiences WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── Projects ──────────────────────────────────────────────────────────────────

router.get("/projects", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM resume_projects ORDER BY sort_order ASC, id ASC").all() as any[];
  res.json(rows.map(r => ({ ...r, tech_stack: parseJson(r.tech_stack, []) })));
});

router.post("/projects", (req: Request, res: Response) => {
  const { name, summary = "", start_date = "", end_date = null, location = "", description = "", tech_stack = [], url = "", sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const result = db.prepare(`
    INSERT INTO resume_projects (name, summary, start_date, end_date, location, description, tech_stack, url, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, summary, start_date, end_date, location, description, JSON.stringify(tech_stack), url, sort_order);
  const row = db.prepare("SELECT * FROM resume_projects WHERE id = ?").get(result.lastInsertRowid) as any;
  res.json({ ...row, tech_stack: parseJson(row.tech_stack, []) });
});

router.put("/projects/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM resume_projects WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { name, summary, start_date, end_date, location, description, tech_stack, url, sort_order } = req.body;
  db.prepare(`
    UPDATE resume_projects SET
      name = ?, summary = ?, start_date = ?, end_date = ?, location = ?,
      description = ?, tech_stack = ?, url = ?, sort_order = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ?? existing.name, summary ?? existing.summary ?? "",
    start_date ?? existing.start_date ?? "",
    end_date !== undefined ? end_date : existing.end_date,
    location ?? existing.location ?? "",
    description ?? existing.description,
    tech_stack !== undefined ? JSON.stringify(tech_stack) : existing.tech_stack,
    url ?? existing.url, sort_order ?? existing.sort_order, id
  );
  const updated = db.prepare("SELECT * FROM resume_projects WHERE id = ?").get(id) as any;
  res.json({ ...updated, tech_stack: parseJson(updated.tech_stack, []) });
});

router.delete("/projects/:id", (req: Request, res: Response) => {
  db.prepare("DELETE FROM resume_projects WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── Education ─────────────────────────────────────────────────────────────────

router.get("/education", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM resume_education ORDER BY sort_order ASC, id ASC").all();
  res.json(rows);
});

router.post("/education", (req: Request, res: Response) => {
  const { institution, degree, field = "", start_date = "", end_date = "", grade = "", sort_order = 0 } = req.body;
  if (!institution || !degree) return res.status(400).json({ error: "institution and degree required" });
  const result = db.prepare(`
    INSERT INTO resume_education (institution, degree, field, start_date, end_date, grade, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(institution, degree, field, start_date, end_date, grade, sort_order);
  res.json(db.prepare("SELECT * FROM resume_education WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/education/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM resume_education WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { institution, degree, field, start_date, end_date, grade, sort_order } = req.body;
  db.prepare(`
    UPDATE resume_education SET
      institution = ?, degree = ?, field = ?, start_date = ?, end_date = ?,
      grade = ?, sort_order = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    institution ?? existing.institution, degree ?? existing.degree,
    field ?? existing.field, start_date ?? existing.start_date,
    end_date ?? existing.end_date, grade ?? existing.grade,
    sort_order ?? existing.sort_order, id
  );
  res.json(db.prepare("SELECT * FROM resume_education WHERE id = ?").get(id));
});

router.delete("/education/:id", (req: Request, res: Response) => {
  db.prepare("DELETE FROM resume_education WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── Extract Skills ────────────────────────────────────────────────────────────
// Given a description text, returns skills detected via the dictionary.
// Custom skills (not in dictionary) must be added by the user via TagInput.

router.post("/extract-skills", (req: Request, res: Response) => {
  const { text = "" } = req.body as { text: string };
  if (!text.trim()) return res.json({ skills: [] });
  res.json({ skills: extractSkillsFromText(text) });
});

// ── Keywords ──────────────────────────────────────────────────────────────────
// Returns all unique skills from the pool — used by pipeline Phase 1 relevance scoring

router.get("/keywords", (_req: Request, res: Response) => {
  const experiences = db.prepare("SELECT skills_used FROM resume_experiences").all() as any[];
  const projects = db.prepare("SELECT tech_stack FROM resume_projects").all() as any[];
  const allSkills = new Set<string>();
  for (const exp of experiences) {
    parseJson(exp.skills_used, []).forEach((s: string) => s.trim() && allSkills.add(s.trim()));
  }
  for (const proj of projects) {
    parseJson(proj.tech_stack, []).forEach((s: string) => s.trim() && allSkills.add(s.trim()));
  }
  const keywords = Array.from(allSkills);
  res.json({ keywords, hasPool: experiences.length > 0 || projects.length > 0 });
});

// ── Select ────────────────────────────────────────────────────────────────────
// Selects top N experiences and projects by JD keyword overlap (called by pipeline Phase 2)

router.post("/select", (req: Request, res: Response) => {
  const { jdKeywords = [], topExperiences = 4, topProjects = 3 } = req.body as {
    jdKeywords: string[];
    topExperiences?: number;
    topProjects?: number;
  };

  const jdSet = new Set(jdKeywords.map((s: string) => s.toLowerCase()));

  const experiences = (db.prepare("SELECT * FROM resume_experiences ORDER BY sort_order ASC, id ASC").all() as any[])
    .map(r => ({ ...r, skills_used: parseJson(r.skills_used, []) as string[] }));

  const projects = (db.prepare("SELECT * FROM resume_projects ORDER BY sort_order ASC, id ASC").all() as any[])
    .map(r => ({ ...r, tech_stack: parseJson(r.tech_stack, []) as string[] }));

  const education = db.prepare("SELECT * FROM resume_education ORDER BY sort_order ASC, id ASC").all();
  const profile = (db.prepare("SELECT * FROM resume_profile WHERE id = 1").get() as any) || {};

  const scoredExperiences = experiences
    .map(exp => ({ ...exp, _score: exp.skills_used.filter((s: string) => jdSet.has(s.toLowerCase())).length }))
    .sort((a, b) => b._score - a._score);

  const scoredProjects = projects
    .map(proj => ({ ...proj, _score: proj.tech_stack.filter((s: string) => jdSet.has(s.toLowerCase())).length }))
    .sort((a, b) => b._score - a._score);

  // Select top items by relevance, then re-sort in reverse chronological order (recent first)
  const parseDate = (d?: string | null) => {
    if (!d) return 0;
    const t = new Date(d).getTime();
    return isNaN(t) ? 0 : t;
  };
  const selectedExperiences = scoredExperiences.slice(0, topExperiences)
    .map(({ _score, ...rest }) => rest)
    .sort((a, b) => parseDate(b.end_date ?? "9999-12-31") - parseDate(a.end_date ?? "9999-12-31")
      || parseDate(b.start_date) - parseDate(a.start_date));
  const selectedProjects = scoredProjects.slice(0, topProjects)
    .map(({ _score, ...rest }) => rest)
    .sort((a, b) => parseDate(b.end_date ?? "9999-12-31") - parseDate(a.end_date ?? "9999-12-31")
      || parseDate(b.start_date) - parseDate(a.start_date));

  const skillsSet = new Set<string>();
  selectedExperiences.forEach(exp => exp.skills_used.forEach((s: string) => skillsSet.add(s)));
  selectedProjects.forEach(proj => proj.tech_stack.forEach((s: string) => skillsSet.add(s)));

  res.json({
    profile: {
      name: profile.name || "",
      email: profile.email || "",
      phone: profile.phone || "",
      location: profile.location || "",
      linkedin: profile.linkedin || "",
      github: profile.github || "",
      portfolio: profile.portfolio || "",
    },
    experiences: selectedExperiences,
    projects: selectedProjects,
    education,
    skills: categorizeSkills(Array.from(skillsSet).filter(Boolean)),
  });
});

export default router;
