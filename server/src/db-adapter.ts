/**
 * Database adapter for InsForge PostgreSQL (Production).
 * 
 * All methods are async so route handlers work with the backend.
 * 
 * InsForge functions accept an optional `client` parameter — an authenticated InsForge client
 * scoped to the current user's JWT. When provided, RLS policies enforce data isolation.
 * When omitted (e.g. from pipeline scripts), the singleton anon client is used.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DbResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export const SETTING_DEFAULTS: Record<string, string> = {
  SEARCH_KEYWORDS: "",
  TARGET_COUNTRIES: "",
  LINKEDIN_SEARCH_URL: "",
  RELEVANCE_SCORE_THRESHOLD: "5",
  TAILORING_INTENSITY: "5",
  BATCH_DELAY_MS: "2000",
  APIFY_JOB_COUNT: "20",
  APIFY_MAX_POLL_MINUTES: "10",
  MAX_JOBS_TEST_LIMIT: "0",
  MAX_AGE_DAYS: "14",
  JOB_LEVELS: "",
  MAX_REQ_YOE: "0",
  RESUME_ORDER: "summary,experience,skills,projects,education",
  SCRAPE_REMOTEOK: "true",
  SCRAPE_JOBICY: "true",
  SCRAPE_HN: "true",
  SCRAPE_WWR: "true",
  SCRAPE_ARBEITNOW: "true",
  SCRAPE_REMOTIVE: "true",
  SCRAPE_DEVTO: "true",
  SCRAPE_CAREERJET: "true",
  SCRAPE_GLASSDOOR: "true",
  SCRAPE_INDEED: "true",
  SCRAPE_SIMPLIFY: "true",
  SCRAPE_NAUKRI: "true",
  SCRAPE_ASHBY: "true",
  SCRAPE_LEVER: "true",
  SCRAPE_GREENHOUSE: "true",
};

// ── InsForge backend ───────────────────────────────────────────────────────────

function getInsforge() {
  return require("./insforge-client").default;
}

/** Resolve the InsForge client — use the per-request authenticated one if provided, else fallback to singleton */
function resolveClient(client?: any) {
  return client || getInsforge();
}

// ── Adapter: Jobs ──────────────────────────────────────────────────────────────

export async function getAllJobs(status?: string, client?: any): Promise<any[]> {
  const c = resolveClient(client);
  let query = c.database.from("jobs").select();
  if (status) query = query.eq("status", status);
  query = query.order("updated_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getJobById(id: any, client?: any): Promise<any | null> {
  const c = resolveClient(client);
  const { data, error } = await c.database.from("jobs").select().eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function jobExistsByLink(jobLink: string, client?: any): Promise<{ id: number } | null> {
  const c = resolveClient(client);
  const { data } = await c.database.from("jobs").select("id").eq("job_link", jobLink).maybeSingle();
  return data;
}

export async function jobExistsByTitleCompany(title: string, company: string, client?: any): Promise<{ id: number } | null> {
  const c = resolveClient(client);
  const { data } = await c.database.from("jobs").select("id")
    .ilike("job_title", title.trim())
    .ilike("company_name", company.trim())
    .maybeSingle();
  return data;
}

export async function upsertJob(fields: Record<string, any>, client?: any, userId?: string): Promise<{ job: any; created: boolean }> {
  const c = resolveClient(client);
  const now = new Date().toISOString();
  const record: Record<string, any> = {
    ...fields,
    applied_date: fields.applied_date || now.split("T")[0],
    source: fields.source || "linkedin",
    source_count: fields.source_count || 1,
    updated_at: now,
  };
  // Only set user_id manually if we are outside a user request context (e.g. pipeline)
  if (userId) record.user_id = userId;

  // Remove undefined values
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }

  // Try insert first; on conflict update
  if (fields.job_link) {
    const existing = await jobExistsByLink(fields.job_link, c);
    if (existing) {
      delete record.created_at;
      const { data, error } = await c.database.from("jobs")
        .update(record)
        .eq("id", existing.id)
        .select();
      if (error) throw error;
      return { job: data?.[0], created: false };
    }
  }

  record.created_at = now;
  const { data, error } = await c.database.from("jobs")
    .insert([record])
    .select();
  if (error) throw error;
  return { job: data?.[0], created: true };
}

export async function updateJob(id: any, fields: Record<string, any>, client?: any): Promise<any | null> {
  const allowedFields = [
    "job_title", "company_name", "company_url", "job_link", "location",
    "salary", "seniority_level", "applicants_count", "apply_url", "resume_url",
    "outreach_email", "description", "status", "match_score", "match_reason",
    "applied_date", "notes", "deadline", "job_category", "interview_date", "offer_date",
    "source", "sources", "source_count", "content_hash", "posted_at", "freshness_score",
    "tags", "resume_keywords", "jd_keywords", "matched_keywords", "added_keywords",
    "missing_keywords", "resume_data",
  ];

  const updates: Record<string, any> = {};
  for (const f of allowedFields) {
    if (fields[f] !== undefined) updates[f] = fields[f];
  }
  if (Object.keys(updates).length === 0) return null;

  const c = resolveClient(client);
  updates.updated_at = new Date().toISOString();
  const { data, error } = await c.database.from("jobs")
    .update(updates)
    .eq("id", id)
    .select();
  if (error) throw error;
  return data?.[0] || null;
}

export async function deleteJob(id: any, client?: any): Promise<boolean> {
  const c = resolveClient(client);
  const { error } = await c.database.from("jobs").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function deleteJobsBatch(ids: any[], client?: any): Promise<number> {
  const c = resolveClient(client);
  const { error } = await c.database.from("jobs").delete().in("id", ids);
  if (error) throw error;
  return ids.length;
}

// ── Adapter: Skills / Snapshots ────────────────────────────────────────────────

export async function getSkillSnapshots(limit: number, client?: any): Promise<any[]> {
  const c = resolveClient(client);
  const { data, error } = await c.database.from("skill_snapshots")
    .select("date, total_jobs, skills_json")
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function upsertSkillSnapshot(date: string, totalJobs: number, skills: any, client?: any, userId?: string): Promise<void> {
  const c = resolveClient(client);
  // Check existing
  const { data: existing } = await c.database.from("skill_snapshots")
    .select("id").eq("date", date).maybeSingle();
  if (existing) {
    await c.database.from("skill_snapshots")
      .update({ total_jobs: totalJobs, skills_json: JSON.stringify(skills) })
      .eq("date", date);
  } else {
    const record: any = { date, total_jobs: totalJobs, skills_json: JSON.stringify(skills) };
    if (userId) record.user_id = userId;
    await c.database.from("skill_snapshots").insert([record]);
  }
}

export async function getJobsWithKeywords(role?: string, location?: string, client?: any): Promise<any[]> {
  const c = resolveClient(client);
  let query = c.database.from("jobs")
    .select("jd_keywords, resume_keywords")
    .neq("jd_keywords", "")
    .not("jd_keywords", "is", null);
  if (role) query = query.ilike("job_title", `%${role}%`);
  if (location) query = query.ilike("location", `%${location}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getJobTitleCounts(client?: any): Promise<any[]> {
  const c = resolveClient(client);
  const { data, error } = await c.database.from("jobs")
    .select("job_title")
    .neq("jd_keywords", "")
    .not("jd_keywords", "is", null);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data || []) {
    const t = (row.job_title || "").toLowerCase().trim();
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([title, cnt]) => ({ title, cnt }))
    .sort((a, b) => b.cnt - a.cnt);
}

export async function getJobLocationCounts(client?: any): Promise<any[]> {
  const c = resolveClient(client);
  const { data, error } = await c.database.from("jobs")
    .select("location")
    .neq("jd_keywords", "")
    .not("jd_keywords", "is", null)
    .not("location", "is", null)
    .neq("location", "");
  if (error) throw error;
  const counts = new Map<string, { location: string; cnt: number }>();
  for (const row of data || []) {
    const key = (row.location || "").toLowerCase();
    if (!counts.has(key)) counts.set(key, { location: row.location, cnt: 0 });
    counts.get(key)!.cnt++;
  }
  return Array.from(counts.values())
    .sort((a, b) => b.cnt - a.cnt)
    .slice(0, 50);
}

export async function archiveJobs(jobs: any[], client?: any, userId?: string): Promise<{ inserted: number; pruned: number }> {
  const c = resolveClient(client);
  const records = jobs
    .filter(j => j.title && j.companyName)
    .map(j => ({
      job_title: j.title,
      company_name: j.companyName,
      location: j.location || null,
      description: j.description || null,
      source: j.source || null,
      content_hash: j.contentHash || null,
      user_id: userId, // Will be undefined if from normal request, letting DB handle it
    }));
  let inserted = 0;
  for (const record of records) {
    if (!record.user_id) delete record.user_id;
    const { error } = await c.database.from("scraped_jobs_archive").insert([record]);
    if (!error) inserted++;
  }
  const cutoff = new Date(Date.now() - 180 * 86400000).toISOString();
  await c.database.from("scraped_jobs_archive").delete().lt("scraped_at", cutoff);
  return { inserted, pruned: 0 };
}

// ── Adapter: Career Events ─────────────────────────────────────────────────────

export async function getEvents(filters: { upcoming?: boolean; location?: string; type?: string }, client?: any): Promise<any[]> {
  const c = resolveClient(client);
  let query = c.database.from("career_events").select();
  if (filters.upcoming) {
    const today = new Date().toISOString().split("T")[0];
    query = query.gte("event_date", today);
  }
  if (filters.location) query = query.ilike("location", `%${filters.location}%`);
  if (filters.type) query = query.eq("event_type", filters.type);
  query = query.order("event_date", { ascending: true }).limit(100);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function batchUpsertEvents(events: any[], client?: any): Promise<number> {
  const c = resolveClient(client);
  let inserted = 0;
  for (const ev of events) {
    const eventUrl = ev.event_url || ev.url;
    if (!ev.title || !eventUrl) continue;
    const { data: existing } = await c.database.from("career_events")
      .select("id").eq("event_url", eventUrl).maybeSingle();
    if (!existing) {
      await c.database.from("career_events").insert([{
        title: ev.title,
        organizer: ev.organizer || null,
        location: ev.location || null,
        event_date: ev.eventDate || ev.event_date || null,
        event_url: eventUrl,
        description: ev.description || null,
        event_type: ev.eventType || ev.event_type || "career_fair",
        source: ev.source || null,
      }]);
      inserted++;
    }
  }
  return inserted;
}

export async function deleteEvent(id: any, client?: any): Promise<boolean> {
  const c = resolveClient(client);
  const { error } = await c.database.from("career_events").delete().eq("id", id);
  if (error) throw error;
  return true;
}

// ── Adapter: Pipeline Settings ─────────────────────────────────────────────────

export async function getAllSettings(client?: any): Promise<Record<string, string>> {
  const c = resolveClient(client);
  const { data, error } = await c.database.from("pipeline_settings").select();
  if (error) throw error;
  const settings: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of data || []) settings[row.key] = row.value;
  return settings;
}

export async function upsertSettings(updates: Record<string, any>, client?: any, userId?: string): Promise<number> {
  const c = resolveClient(client);
  let changed = 0;
  for (const [key, value] of Object.entries(updates)) {
    const { data: existing } = await c.database.from("pipeline_settings")
      .select("key").eq("key", key).maybeSingle();
    if (existing) {
      await c.database.from("pipeline_settings").update({ value: String(value) }).eq("key", key);
    } else {
      const record: any = { key, value: String(value) };
      if (userId) record.user_id = userId;
      await c.database.from("pipeline_settings").insert([record]);
    }
    changed++;
  }
  return changed;
}

// ── Adapter: Resume Pool ───────────────────────────────────────────────────────

export async function getProfile(client?: any): Promise<any> {
  const c = resolveClient(client);
  // With RLS + per-user rows, just get the single row for this user
  const { data } = await c.database.from("resume_profile").select().maybeSingle();
  return data || { name: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" };
}

export async function upsertProfile(fields: Record<string, string>, client?: any, userId?: string): Promise<void> {
  const { name = "", email = "", phone = "", location = "", linkedin = "", github = "", portfolio = "" } = fields;
  const c = resolveClient(client);
  const now = new Date().toISOString();

  const record: any = { name, email, phone, location, linkedin, github, portfolio, updated_at: now };
  if (userId) record.user_id = userId;

  const { error } = await c.database.from("resume_profile").upsert(record);
  if (error) throw error;
  return;
}

export async function getExperiences(client?: any): Promise<any[]> {
  const c = resolveClient(client);
  const { data, error } = await c.database.from("resume_experiences")
    .select()
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r, skills_used: parseJson(r.skills_used, []) }));
}

export async function createExperience(fields: any, client?: any, userId?: string): Promise<any> {
  const { company, title, location = "", start_date = "", end_date = null, summary = "", description = "", skills_used = [], sort_order = 0 } = fields;
  const c = resolveClient(client);
  const record: any = { company, title, location, start_date, end_date, summary, description, skills_used: JSON.stringify(skills_used), sort_order };
  if (userId) record.user_id = userId;
  const { data, error } = await c.database.from("resume_experiences")
    .insert([record])
    .select();
  if (error) throw error;
  const row = data?.[0];
  return row ? { ...row, skills_used: parseJson(row.skills_used, []) } : null;
}

export async function updateExperience(id: any, fields: any, client?: any): Promise<any | null> {
  const c = resolveClient(client);
  const { data: existing } = await c.database.from("resume_experiences").select().eq("id", id).maybeSingle();
  if (!existing) return null;
  const update: any = {
    company: fields.company ?? existing.company,
    title: fields.title ?? existing.title,
    location: fields.location ?? existing.location,
    start_date: fields.start_date ?? existing.start_date,
    end_date: fields.end_date !== undefined ? fields.end_date : existing.end_date,
    summary: fields.summary ?? existing.summary ?? "",
    description: fields.description ?? existing.description,
    skills_used: fields.skills_used !== undefined ? JSON.stringify(fields.skills_used) : existing.skills_used,
    sort_order: fields.sort_order ?? existing.sort_order,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await c.database.from("resume_experiences").update(update).eq("id", id).select();
  if (error) throw error;
  const row = data?.[0];
  return row ? { ...row, skills_used: parseJson(row.skills_used, []) } : null;
}

export async function deleteExperience(id: any, client?: any): Promise<void> {
  await resolveClient(client).database.from("resume_experiences").delete().eq("id", id);
}

export async function getProjects(client?: any): Promise<any[]> {
  const c = resolveClient(client);
  const { data, error } = await c.database.from("resume_projects")
    .select()
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r, tech_stack: parseJson(r.tech_stack, []) }));
}

export async function createProject(fields: any, client?: any, userId?: string): Promise<any> {
  const { name, summary = "", start_date = "", end_date = null, location = "", description = "", tech_stack = [], url = "", sort_order = 0 } = fields;
  const c = resolveClient(client);
  const record: any = { name, summary, start_date, end_date, location, description, tech_stack: JSON.stringify(tech_stack), url, sort_order };
  if (userId) record.user_id = userId;
  const { data, error } = await c.database.from("resume_projects")
    .insert([record])
    .select();
  if (error) throw error;
  const row = data?.[0];
  return row ? { ...row, tech_stack: parseJson(row.tech_stack, []) } : null;
}

export async function updateProject(id: any, fields: any, client?: any): Promise<any | null> {
  const c = resolveClient(client);
  const { data: existing } = await c.database.from("resume_projects").select().eq("id", id).maybeSingle();
  if (!existing) return null;
  const update: any = {
    name: fields.name ?? existing.name,
    summary: fields.summary ?? existing.summary ?? "",
    start_date: fields.start_date ?? existing.start_date ?? "",
    end_date: fields.end_date !== undefined ? fields.end_date : existing.end_date,
    location: fields.location ?? existing.location ?? "",
    description: fields.description ?? existing.description,
    tech_stack: fields.tech_stack !== undefined ? JSON.stringify(fields.tech_stack) : existing.tech_stack,
    url: fields.url ?? existing.url,
    sort_order: fields.sort_order ?? existing.sort_order,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await c.database.from("resume_projects").update(update).eq("id", id).select();
  if (error) throw error;
  const row = data?.[0];
  return row ? { ...row, tech_stack: parseJson(row.tech_stack, []) } : null;
}

export async function deleteProject(id: any, client?: any): Promise<void> {
  await resolveClient(client).database.from("resume_projects").delete().eq("id", id);
}

export async function getEducation(client?: any): Promise<any[]> {
  const c = resolveClient(client);
  const { data, error } = await c.database.from("resume_education")
    .select()
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createEducation(fields: any, client?: any, userId?: string): Promise<any> {
  const { institution, degree, field = "", start_date = "", end_date = "", grade = "", sort_order = 0 } = fields;
  const c = resolveClient(client);
  const record: any = { institution, degree, field, start_date, end_date, grade, sort_order };
  if (userId) record.user_id = userId;
  const { data, error } = await c.database.from("resume_education")
    .insert([record])
    .select();
  if (error) throw error;
  return data?.[0];
}

export async function updateEducation(id: any, fields: any, client?: any): Promise<any | null> {
  const c = resolveClient(client);
  const { data: existing } = await c.database.from("resume_education").select().eq("id", id).maybeSingle();
  if (!existing) return null;
  const update: any = {
    institution: fields.institution ?? existing.institution,
    degree: fields.degree ?? existing.degree,
    field: fields.field ?? existing.field,
    start_date: fields.start_date ?? existing.start_date,
    end_date: fields.end_date ?? existing.end_date,
    grade: fields.grade ?? existing.grade,
    sort_order: fields.sort_order ?? existing.sort_order,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await c.database.from("resume_education").update(update).eq("id", id).select();
  if (error) throw error;
  return data?.[0] || null;
}

export async function deleteEducation(id: any, client?: any): Promise<void> {
  await resolveClient(client).database.from("resume_education").delete().eq("id", id);
}

// Resume pool keyword aggregation (used by pipeline)
export async function getPoolKeywords(client?: any): Promise<{ keywords: string[]; hasPool: boolean }> {
  const experiences = await getExperiences(client);
  const projects = await getProjects(client);
  const allSkills = new Set<string>();
  for (const exp of experiences) {
    (exp.skills_used || []).forEach((s: string) => s.trim() && allSkills.add(s.trim()));
  }
  for (const proj of projects) {
    (proj.tech_stack || []).forEach((s: string) => s.trim() && allSkills.add(s.trim()));
  }
  return { keywords: Array.from(allSkills), hasPool: experiences.length > 0 || projects.length > 0 };
}

// Resume pool selection (used by pipeline Phase 2)
export async function selectPoolItems(jdKeywords: string[], topExperiences = 4, topProjects = 3, client?: any): Promise<any> {
  const jdSet = new Set(jdKeywords.map(s => s.toLowerCase()));
  const experiences = await getExperiences(client);
  const projects = await getProjects(client);
  const education = await getEducation(client);
  const profile = await getProfile(client);

  const scoredExperiences = experiences
    .map(exp => ({ ...exp, _score: (exp.skills_used || []).filter((s: string) => jdSet.has(s.toLowerCase())).length }))
    .sort((a, b) => b._score - a._score);

  const scoredProjects = projects
    .map(proj => ({ ...proj, _score: (proj.tech_stack || []).filter((s: string) => jdSet.has(s.toLowerCase())).length }))
    .sort((a, b) => b._score - a._score);

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

  return { profile, experiences: selectedExperiences, projects: selectedProjects, education };
}

/**
 * Upload a resume PDF to InsForge Storage.
 * Path: resumes/{userId}/{filename}
 */
export async function uploadResume(filename: string, buffer: Buffer, client?: any): Promise<string> {
  const c = resolveClient(client);
  const { data: user } = await c.auth.getCurrentUser();
  if (!user?.user?.id) throw new Error("User ID not found for upload");

  const path = `${user.user.id}/${filename}`;
  
  // Node.js Buffer doesn't have .size which SDK expects (Blob/File)
  // Converting to Blob ensures .size and .type are available
  const blob = new Blob([buffer], { type: "application/pdf" });
  
  // The SDK upload method only accepts (path, file)
  const { data, error } = await c.storage.from("resumes").upload(path, blob as any);

  if (error) throw error;
  if (!data?.url) throw new Error("Upload succeeded but no URL returned");

  return data.url;
}

/**
 * Download a resume PDF from InsForge Storage.
 */
export async function downloadResume(filename: string, client?: any): Promise<{ buffer: Buffer; contentType: string }> {
  const c = resolveClient(client);
  const { data: user } = await c.auth.getCurrentUser();
  if (!user?.user?.id) throw new Error("User ID not found for download");

  const path = `${user.user.id}/${filename}`;
  const { data: blob, error } = await c.storage.from("resumes").download(path);

  if (error) throw error;
  if (!blob) throw new Error("File not found");

  const arrayBuffer = await blob.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: blob.type || "application/pdf",
  };
}

// ── Adapter: Interview Prep ────────────────────────────────────────────────────

export async function getInterviewPrep(jobId: number, client?: any): Promise<any | null> {
  const c = resolveClient(client);
  const { data, error } = await c.database.from("interview_prep")
    .select()
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertInterviewPrep(jobId: number, fields: Record<string, any>, client?: any, userId?: string): Promise<any> {
  const c = resolveClient(client);
  const now = new Date().toISOString();
  const record: Record<string, any> = {
    job_id: jobId,
    status: fields.status || "pending",
    updated_at: now,
    created_at: now,
  };
  if (userId) record.user_id = userId;

  // Check existing first (UNIQUE on user_id+job_id)
  const existing = await getInterviewPrep(jobId, c);
  if (existing) {
    return updateInterviewPrep(existing.id, fields, c);
  }

  const { data, error } = await c.database.from("interview_prep").insert([record]).select();
  if (error) throw error;
  return data?.[0];
}

export async function updateInterviewPrep(id: number, fields: Record<string, any>, client?: any): Promise<any | null> {
  const c = resolveClient(client);
  const allowed = ["intel_report_url", "prep_guide_url", "status", "error_message", "web_research", "email_context", "updated_at"];
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (fields[key] !== undefined) updates[key] = fields[key];
  }
  const { data, error } = await c.database.from("interview_prep").update(updates).eq("id", id).select();
  if (error) throw error;
  return data?.[0] || null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseJson(str: string | null | undefined, fallback: any): any {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}
