import { Job, JobStatus, CareerEvent, SkillData, ResumeProfile, ResumeExperience, ResumeProject, ResumeEducation, InterviewPrep } from "./types";

const API_SERVER = import.meta.env.VITE_API_URL ?? "";
const API_BASE = "/api/jobs";

// ─── Auth Token Management ───────────────────────────────────────────

let authToken: string | null = localStorage.getItem("auth_token");

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem("auth_token", token);
  else localStorage.removeItem("auth_token");
}

export function getAuthToken(): string | null {
  return authToken;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return headers;
}

function authHeadersNoBody(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return headers;
}

// Auto-refresh token on 401 and retry the request once
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return false;
  try {
    const result = await apiRefreshToken(refreshToken);
    setAuthToken(result.accessToken);
    if (result.refreshToken) localStorage.setItem("refresh_token", result.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url.startsWith("/") ? `${API_SERVER}${url}` : url, init);
  if (res.status !== 401) return res;

  // Deduplicate concurrent refresh attempts
  if (!refreshPromise) {
    refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null; });
  }
  const refreshed = await refreshPromise;
  if (!refreshed) return res;

  // Retry with new token
  const newInit = { ...init, headers: { ...init?.headers } as Record<string, string> };
  if (authToken) newInit.headers["Authorization"] = `Bearer ${authToken}`;
  return fetch(url.startsWith("/") ? `${API_SERVER}${url}` : url, newInit);
}

// ─── Auth API ─────────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string): Promise<{ user: any; accessToken: string; refreshToken?: string }> {
  const res = await fetch(`${API_SERVER}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error || "Login failed");
  }
  return res.json();
}

export async function apiSignup(email: string, password: string, name: string): Promise<{ user: any; accessToken: string; refreshToken?: string }> {
  const res = await fetch(`${API_SERVER}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Signup failed" }));
    throw new Error(err.error || "Signup failed");
  }
  return res.json();
}

export async function apiVerifyEmail(email: string, otp: string): Promise<{ user: any; accessToken: string; refreshToken?: string }> {
  const res = await fetch(`${API_SERVER}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Verification failed" }));
    throw new Error(err.error || "Verification failed");
  }
  return res.json();
}

export async function apiResendVerification(email: string): Promise<void> {
  const res = await fetch(`${API_SERVER}/api/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to resend" }));
    throw new Error(err.error || "Failed to resend verification email");
  }
}

export async function apiLogout(): Promise<void> {
  await fetch(`${API_SERVER}/api/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  }).catch(() => {});
}

export async function apiGetMe(): Promise<{ user: any }> {
  const res = await fetch(`${API_SERVER}/api/auth/me`, {
    headers: authHeadersNoBody(),
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

export async function apiRefreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; user: any }> {
  const res = await fetch(`${API_SERVER}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  return res.json();
}

// ─── Jobs API ─────────────────────────────────────────────────────────

export async function fetchJobs(): Promise<Job[]> {
  const res = await authFetch(API_BASE, { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

export async function updateJobStatus(id: number, status: JobStatus): Promise<Job> {
  const res = await authFetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update job");
  return res.json();
}

export async function updateJobNotes(id: number, notes: string): Promise<Job> {
  const res = await authFetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error("Failed to update notes");
  return res.json();
}

export async function deleteJob(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/${id}`, { method: "DELETE", headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to delete job");
}

export async function batchDeleteJobs(ids: number[]): Promise<{ deleted: number }> {
  const res = await authFetch(`${API_BASE}/batch`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Failed to batch delete jobs");
  return res.json();
}

export async function createJob(job: Partial<Job>): Promise<Job> {
  const res = await authFetch(API_BASE, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(job),
  });
  if (!res.ok) throw new Error("Failed to create job");
  return res.json();
}

// ─── Gmail API ────────────────────────────────────────────────────────

export async function gmailStatus(): Promise<{ connected: boolean; lastSync: string | null }> {
  const res = await authFetch("/api/gmail/status", { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to get Gmail status");
  return res.json();
}

export async function gmailAuth(): Promise<{ url: string }> {
  const res = await authFetch("/api/gmail/auth", { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to get Gmail auth URL");
  return res.json();
}

export async function gmailDisconnect(): Promise<void> {
  const res = await authFetch("/api/gmail/disconnect", { method: "POST", headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to disconnect Gmail");
}

export async function gmailSync(): Promise<{ synced: number; updates: any[]; scanned: number }> {
  const res = await authFetch("/api/gmail/sync", { method: "POST", headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Sync failed" }));
    throw new Error(err.error || "Sync failed");
  }
  return res.json();
}

// ─── Skills API ───────────────────────────────────────────────────────

export async function fetchCurrentSkills(
  filters?: { role?: string; location?: string }
): Promise<{ total_jobs: number; skills: SkillData[]; resume_skills: string[] }> {
  const params = new URLSearchParams();
  if (filters?.role) params.set("role", filters.role);
  if (filters?.location) params.set("location", filters.location);
  const res = await authFetch(`/api/skills/current?${params}`, { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to fetch skills");
  return res.json();
}

export interface SkillFilter {
  label: string;
  value: string;
  count: number;
}

export async function fetchSkillFilters(): Promise<{ roles: SkillFilter[]; locations: SkillFilter[] }> {
  const res = await authFetch("/api/skills/filters", { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to fetch skill filters");
  return res.json();
}

// ─── Events API ───────────────────────────────────────────────────────

export async function fetchEvents(
  upcomingOnly = true,
  filters?: { location?: string; type?: string }
): Promise<CareerEvent[]> {
  const params = new URLSearchParams({ upcoming: String(upcomingOnly) });
  if (filters?.location) params.set("location", filters.location);
  if (filters?.type) params.set("type", filters.type);
  const res = await authFetch(`/api/events?${params}`, { headers: authHeadersNoBody() });
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
  const res = await authFetch("/api/settings", { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function updateSettings(updates: Partial<PipelineConfig>): Promise<void> {
  const res = await authFetch("/api/settings", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update settings");
}


// ─── Resume Pool API ─────────────────────────────────────────────────

const POOL_BASE = "/api/resume-pool";

export async function fetchPoolProfile(): Promise<ResumeProfile> {
  const res = await authFetch(`${POOL_BASE}/profile`, { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function updatePoolProfile(profile: ResumeProfile): Promise<void> {
  const res = await authFetch(`${POOL_BASE}/profile`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error("Failed to update profile");
}

export async function fetchPoolExperiences(): Promise<ResumeExperience[]> {
  const res = await authFetch(`${POOL_BASE}/experiences`, { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to fetch experiences");
  return res.json();
}

export async function createPoolExperience(data: Omit<ResumeExperience, "id" | "sort_order">): Promise<ResumeExperience> {
  const res = await authFetch(`${POOL_BASE}/experiences`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create experience");
  return res.json();
}

export async function updatePoolExperience(id: number, data: Partial<ResumeExperience>): Promise<ResumeExperience> {
  const res = await authFetch(`${POOL_BASE}/experiences/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update experience");
  return res.json();
}

export async function deletePoolExperience(id: number): Promise<void> {
  const res = await authFetch(`${POOL_BASE}/experiences/${id}`, { method: "DELETE", headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to delete experience");
}

export async function fetchPoolProjects(): Promise<ResumeProject[]> {
  const res = await authFetch(`${POOL_BASE}/projects`, { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function createPoolProject(data: Omit<ResumeProject, "id" | "sort_order">): Promise<ResumeProject> {
  const res = await authFetch(`${POOL_BASE}/projects`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function updatePoolProject(id: number, data: Partial<ResumeProject>): Promise<ResumeProject> {
  const res = await authFetch(`${POOL_BASE}/projects/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

export async function deletePoolProject(id: number): Promise<void> {
  const res = await authFetch(`${POOL_BASE}/projects/${id}`, { method: "DELETE", headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to delete project");
}

export async function fetchPoolEducation(): Promise<ResumeEducation[]> {
  const res = await authFetch(`${POOL_BASE}/education`, { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to fetch education");
  return res.json();
}

export async function createPoolEducation(data: Omit<ResumeEducation, "id" | "sort_order">): Promise<ResumeEducation> {
  const res = await authFetch(`${POOL_BASE}/education`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create education");
  return res.json();
}

export async function updatePoolEducation(id: number, data: Partial<ResumeEducation>): Promise<ResumeEducation> {
  const res = await authFetch(`${POOL_BASE}/education/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update education");
  return res.json();
}

export async function deletePoolEducation(id: number): Promise<void> {
  const res = await authFetch(`${POOL_BASE}/education/${id}`, { method: "DELETE", headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to delete education");
}

// ─── Pipeline API ─────────────────────────────────────────────────────

export function runPipeline(
  onLog: (type: string, data: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): AbortController {
  const controller = new AbortController();
  const refreshToken = localStorage.getItem("refresh_token");

  fetch("/api/pipeline/run", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ refreshToken }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to start pipeline" }));
      onError(err.error || "Failed to start pipeline");
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError("No response stream");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "done") {
              onLog("done", event.data);
              onDone();
            } else {
              onLog(event.type, event.data);
            }
          } catch {}
        }
      }
    }
  }).catch((err) => {
    if (err.name !== "AbortError") {
      onError(err.message || "Pipeline connection lost");
    }
  });

  return controller;
}

export async function getPipelineStatus(): Promise<{ running: boolean }> {
  const res = await authFetch("/api/pipeline/status", { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to get pipeline status");
  return res.json();
}

export async function stopPipeline(): Promise<void> {
  await authFetch("/api/pipeline/stop", { method: "POST", headers: authHeadersNoBody() });
}

// ─── Interview Prep API ───────────────────────────────────────────────

const PREP_BASE = "/api/interview-prep";

export async function fetchInterviewPrep(jobId: number): Promise<InterviewPrep> {
  const res = await authFetch(`${PREP_BASE}/${jobId}`, { headers: authHeadersNoBody() });
  if (!res.ok) throw new Error("Failed to fetch interview prep");
  return res.json();
}

export async function generatePrep(jobId: number): Promise<{ status: string; prepId: number }> {
  const res = await authFetch(`${PREP_BASE}/${jobId}/generate`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to start prep generation");
  return res.json();
}

export async function regeneratePrep(jobId: number): Promise<{ status: string; prepId: number }> {
  const res = await authFetch(`${PREP_BASE}/${jobId}/regenerate`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to regenerate prep");
  return res.json();
}

export function getPrepViewUrl(filename: string): string {
  const token = getAuthToken();
  return `/api/interview-prep/view/${filename}?token=${token}`;
}

export async function extractPoolSkills(text: string): Promise<string[]> {
  const res = await authFetch(`${POOL_BASE}/extract-skills`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Failed to extract skills");
  const data = await res.json();
  return data.skills as string[];
}
