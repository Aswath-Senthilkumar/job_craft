import { Job, JobStatus, CareerEvent, SkillData, ResumeProfile, ResumeExperience, ResumeProject, ResumeEducation } from "./types";

const API_BASE = "/api/jobs";

export async function fetchJobs(): Promise<Job[]> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

export async function updateJobStatus(id: number, status: JobStatus): Promise<Job> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update job");
  return res.json();
}

export async function updateJobNotes(id: number, notes: string): Promise<Job> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error("Failed to update notes");
  return res.json();
}

export async function deleteJob(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete job");
}

export async function batchDeleteJobs(ids: number[]): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/batch`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Failed to batch delete jobs");
  return res.json();
}

export async function createJob(job: Partial<Job>): Promise<Job> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  });
  if (!res.ok) throw new Error("Failed to create job");
  return res.json();
}

export async function gmailStatus(): Promise<{ connected: boolean; lastSync: string | null }> {
  const res = await fetch("/api/gmail/status");
  if (!res.ok) throw new Error("Failed to get Gmail status");
  return res.json();
}

export async function gmailAuth(): Promise<{ url: string }> {
  const res = await fetch("/api/gmail/auth");
  if (!res.ok) throw new Error("Failed to get Gmail auth URL");
  return res.json();
}

export async function gmailDisconnect(): Promise<void> {
  const res = await fetch("/api/gmail/disconnect", { method: "POST" });
  if (!res.ok) throw new Error("Failed to disconnect Gmail");
}

export async function gmailSync(): Promise<{ synced: number; updates: any[]; scanned: number }> {
  const res = await fetch("/api/gmail/sync", { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Sync failed" }));
    throw new Error(err.error || "Sync failed");
  }
  return res.json();
}

export async function fetchCurrentSkills(
  filters?: { role?: string; location?: string }
): Promise<{ total_jobs: number; skills: SkillData[]; resume_skills: string[] }> {
  const params = new URLSearchParams();
  if (filters?.role) params.set("role", filters.role);
  if (filters?.location) params.set("location", filters.location);
  const res = await fetch(`/api/skills/current?${params}`);
  if (!res.ok) throw new Error("Failed to fetch skills");
  return res.json();
}

export interface SkillFilter {
  label: string;
  value: string;
  count: number;
}

export async function fetchSkillFilters(): Promise<{ roles: SkillFilter[]; locations: SkillFilter[] }> {
  const res = await fetch("/api/skills/filters");
  if (!res.ok) throw new Error("Failed to fetch skill filters");
  return res.json();
}

export async function fetchEvents(
  upcomingOnly = true,
  filters?: { location?: string; type?: string }
): Promise<CareerEvent[]> {
  const params = new URLSearchParams({ upcoming: String(upcomingOnly) });
  if (filters?.location) params.set("location", filters.location);
  if (filters?.type) params.set("type", filters.type);
  const res = await fetch(`/api/events?${params}`);
  if (!res.ok) throw new Error("Failed to fetch events");
  return res.json();
}

// ─── Settings API ────────────────────────────────────────────────────

export interface PipelineConfig {
  RELEVANCE_SCORE_THRESHOLD: number;
  TAILORING_INTENSITY: number;
  APIFY_JOB_COUNT: number;
  BATCH_DELAY_MS: number;
  APIFY_MAX_POLL_MINUTES: number;
  MAX_JOBS_TEST_LIMIT: number;
  SEARCH_KEYWORDS: string;
  TARGET_COUNTRIES: string;
  LINKEDIN_SEARCH_URL: string;
  MAX_AGE_DAYS: number;
  JOB_LEVELS: string;
  MAX_REQ_YOE: number;
  RESUME_ORDER: string;

  SCRAPE_REMOTEOK: boolean;
  SCRAPE_JOBICY: boolean;
  SCRAPE_HN: boolean;
  SCRAPE_WWR: boolean;
  SCRAPE_ARBEITNOW: boolean;
  SCRAPE_REMOTIVE: boolean;
  SCRAPE_DEVTO: boolean;
  SCRAPE_CAREERJET: boolean;
  SCRAPE_GLASSDOOR: boolean;
  SCRAPE_INDEED: boolean;
  SCRAPE_SIMPLIFY: boolean;
  SCRAPE_NAUKRI: boolean;
  SCRAPE_ASHBY: boolean;
  SCRAPE_LEVER: boolean;
  SCRAPE_GREENHOUSE: boolean;
}

export interface SettingsData {
  config: PipelineConfig;
}

export async function fetchSettings(): Promise<SettingsData> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function updateSettings(updates: Partial<PipelineConfig>): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update settings");
}


// ─── Resume Pool API ─────────────────────────────────────────────────

const POOL_BASE = "/api/resume-pool";

export async function fetchPoolProfile(): Promise<ResumeProfile> {
  const res = await fetch(`${POOL_BASE}/profile`);
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function updatePoolProfile(profile: ResumeProfile): Promise<void> {
  const res = await fetch(`${POOL_BASE}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error("Failed to update profile");
}

export async function fetchPoolExperiences(): Promise<ResumeExperience[]> {
  const res = await fetch(`${POOL_BASE}/experiences`);
  if (!res.ok) throw new Error("Failed to fetch experiences");
  return res.json();
}

export async function createPoolExperience(data: Omit<ResumeExperience, "id" | "sort_order">): Promise<ResumeExperience> {
  const res = await fetch(`${POOL_BASE}/experiences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create experience");
  return res.json();
}

export async function updatePoolExperience(id: number, data: Partial<ResumeExperience>): Promise<ResumeExperience> {
  const res = await fetch(`${POOL_BASE}/experiences/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update experience");
  return res.json();
}

export async function deletePoolExperience(id: number): Promise<void> {
  const res = await fetch(`${POOL_BASE}/experiences/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete experience");
}

export async function fetchPoolProjects(): Promise<ResumeProject[]> {
  const res = await fetch(`${POOL_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function createPoolProject(data: Omit<ResumeProject, "id" | "sort_order">): Promise<ResumeProject> {
  const res = await fetch(`${POOL_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function updatePoolProject(id: number, data: Partial<ResumeProject>): Promise<ResumeProject> {
  const res = await fetch(`${POOL_BASE}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

export async function deletePoolProject(id: number): Promise<void> {
  const res = await fetch(`${POOL_BASE}/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete project");
}

export async function fetchPoolEducation(): Promise<ResumeEducation[]> {
  const res = await fetch(`${POOL_BASE}/education`);
  if (!res.ok) throw new Error("Failed to fetch education");
  return res.json();
}

export async function createPoolEducation(data: Omit<ResumeEducation, "id" | "sort_order">): Promise<ResumeEducation> {
  const res = await fetch(`${POOL_BASE}/education`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create education");
  return res.json();
}

export async function updatePoolEducation(id: number, data: Partial<ResumeEducation>): Promise<ResumeEducation> {
  const res = await fetch(`${POOL_BASE}/education/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update education");
  return res.json();
}

export async function deletePoolEducation(id: number): Promise<void> {
  const res = await fetch(`${POOL_BASE}/education/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete education");
}

export async function extractPoolSkills(text: string): Promise<string[]> {
  const res = await fetch(`${POOL_BASE}/extract-skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Failed to extract skills");
  const data = await res.json();
  return data.skills as string[];
}
