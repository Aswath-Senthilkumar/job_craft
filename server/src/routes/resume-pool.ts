import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import {
  getProfile, upsertProfile,
  getExperiences, createExperience, updateExperience, deleteExperience,
  getProjects, createProject, updateProject, deleteProject,
  getEducation, createEducation, updateEducation, deleteEducation,
  getPoolKeywords, selectPoolItems, uploadResume, downloadResume,
} from "../db-adapter";

const upload = multer({ storage: multer.memoryStorage() });

// ── Skill extraction (mirrors pipeline/src/services/skill-matcher.ts) ─────────

interface SkillEntry { canonical: string; aliases: string[] }

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

// ── Profile ───────────────────────────────────────────────────────────────────

router.get("/profile", async (req: Request, res: Response) => {
  try {
    res.json(await getProfile(req.insforgeClient));
  } catch (err: any) {
    console.error("GET /profile error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch profile" });
  }
});

router.put("/profile", async (req: Request, res: Response) => {
  try {
    await upsertProfile(req.body, req.insforgeClient, req.userId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("PUT /profile error:", err);
    res.status(500).json({ error: err.message || "Failed to update profile" });
  }
});

// ── Experiences ───────────────────────────────────────────────────────────────

router.get("/experiences", async (req: Request, res: Response) => {
  try {
    res.json(await getExperiences(req.insforgeClient));
  } catch (err: any) {
    console.error("GET /experiences error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch experiences" });
  }
});

router.post("/experiences", async (req: Request, res: Response) => {
  const { company, title } = req.body;
  if (!company || !title) return res.status(400).json({ error: "company and title required" });
  try {
    res.json(await createExperience(req.body, req.insforgeClient, req.userId));
  } catch (err: any) {
    console.error("POST /experiences error:", err);
    res.status(500).json({ error: err.message || "Failed to create experience" });
  }
});

router.put("/experiences/:id", async (req: Request, res: Response) => {
  try {
    const result = await updateExperience(req.params.id, req.body, req.insforgeClient);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (err: any) {
    console.error("PUT /experiences error:", err);
    res.status(500).json({ error: err.message || "Failed to update experience" });
  }
});

router.delete("/experiences/:id", async (req: Request, res: Response) => {
  try {
    await deleteExperience(req.params.id, req.insforgeClient);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /experiences error:", err);
    res.status(500).json({ error: err.message || "Failed to delete experience" });
  }
});

// ── Projects ──────────────────────────────────────────────────────────────────

router.get("/projects", async (req: Request, res: Response) => {
  try {
    res.json(await getProjects(req.insforgeClient));
  } catch (err: any) {
    console.error("GET /projects error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch projects" });
  }
});

router.post("/projects", async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    res.json(await createProject(req.body, req.insforgeClient, req.userId));
  } catch (err: any) {
    console.error("POST /projects error:", err);
    res.status(500).json({ error: err.message || "Failed to create project" });
  }
});

router.put("/projects/:id", async (req: Request, res: Response) => {
  try {
    const result = await updateProject(req.params.id, req.body, req.insforgeClient);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (err: any) {
    console.error("PUT /projects error:", err);
    res.status(500).json({ error: err.message || "Failed to update project" });
  }
});

router.delete("/projects/:id", async (req: Request, res: Response) => {
  try {
    await deleteProject(req.params.id, req.insforgeClient);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /projects error:", err);
    res.status(500).json({ error: err.message || "Failed to delete project" });
  }
});

// ── Education ─────────────────────────────────────────────────────────────────

router.get("/education", async (req: Request, res: Response) => {
  try {
    res.json(await getEducation(req.insforgeClient));
  } catch (err: any) {
    console.error("GET /education error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch education" });
  }
});

router.post("/education", async (req: Request, res: Response) => {
  const { institution, degree } = req.body;
  if (!institution || !degree) return res.status(400).json({ error: "institution and degree required" });
  try {
    res.json(await createEducation(req.body, req.insforgeClient, req.userId));
  } catch (err: any) {
    console.error("POST /education error:", err);
    res.status(500).json({ error: err.message || "Failed to create education" });
  }
});

router.put("/education/:id", async (req: Request, res: Response) => {
  try {
    const result = await updateEducation(req.params.id, req.body, req.insforgeClient);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (err: any) {
    console.error("PUT /education error:", err);
    res.status(500).json({ error: err.message || "Failed to update education" });
  }
});

router.delete("/education/:id", async (req: Request, res: Response) => {
  try {
    await deleteEducation(req.params.id, req.insforgeClient);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /education error:", err);
    res.status(500).json({ error: err.message || "Failed to delete education" });
  }
});

// ── Extract Skills ────────────────────────────────────────────────────────────

router.post("/extract-skills", (req: Request, res: Response) => {
  const { text = "" } = req.body as { text: string };
  if (!text.trim()) return res.json({ skills: [] });
  res.json({ skills: extractSkillsFromText(text) });
});

// ── Keywords ──────────────────────────────────────────────────────────────────

router.get("/keywords", async (req: Request, res: Response) => {
  try {
    res.json(await getPoolKeywords(req.insforgeClient));
  } catch (err: any) {
    console.error("GET /keywords error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch keywords" });
  }
});

// ── Select ────────────────────────────────────────────────────────────────────

router.post("/select", async (req: Request, res: Response) => {
  const { jdKeywords = [], topExperiences = 4, topProjects = 3 } = req.body as {
    jdKeywords: string[];
    topExperiences?: number;
    topProjects?: number;
  };

  try {
    const { profile, experiences, projects, education } = await selectPoolItems(jdKeywords, topExperiences, topProjects, req.insforgeClient);

    const skillsSet = new Set<string>();
    experiences.forEach((exp: any) => (exp.skills_used || []).forEach((s: string) => skillsSet.add(s)));
    projects.forEach((proj: any) => (proj.tech_stack || []).forEach((s: string) => skillsSet.add(s)));

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
      experiences,
      projects,
      education,
      skills: categorizeSkills(Array.from(skillsSet).filter(Boolean)),
    });
  } catch (err: any) {
    console.error("POST /select error:", err);
    res.status(500).json({ error: err.message || "Failed to select pool items" });
  }
});

// ── Storage ───────────────────────────────────────────────────────────────────

/**
 * POST /api/resume-pool/upload
 * Upload a PDF to InsForge storage and return the public URL.
 */
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const filename = req.body.filename || req.file.originalname;
    const url = await uploadResume(filename, req.file.buffer, req.insforgeClient);
    res.json({ url });
  } catch (err: any) {
    console.error("POST /upload error:", err);
    res.status(500).json({ error: err.message || "Failed to upload file" });
  }
});

/**
 * GET /api/resume-pool/view/:filename
 * Proxy route to serve stored PDFs with inline disposition so they open in browser tabs.
 */
router.get("/view/:filename", async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename as string;
    const userId = req.userId;
    if (!userId) throw new Error("Unauthorized");

    const ossHost = process.env.INSFORGE_BASE_URL;
    if (!ossHost) throw new Error("INSFORGE_BASE_URL not configured");

    // Public URL where the file is hosted
    const publicUrl = `${ossHost}/api/storage/buckets/resumes/objects/${userId}%2F${encodeURIComponent(filename)}`;
    
    // Fetch the file from storage as a buffer
    const response = await fetch(publicUrl);
    if (!response.ok) throw new Error(`Storage returned ${response.status}`);
    
    const buffer = await response.arrayBuffer();

    // Set headers to FORCE inline viewing
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error("GET /view/:filename error:", err);
    res.status(404).send("File not found or access denied");
  }
});

export default router;
