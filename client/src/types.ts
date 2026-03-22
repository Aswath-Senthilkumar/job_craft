export type JobStatus = "filtered" | "saved" | "applied" | "interviewing" | "offer" | "rejected";

export interface Job {
  id: number;
  job_title: string;
  company_name: string;
  company_url: string | null;
  job_link: string | null;
  location: string | null;
  salary: string | null;
  seniority_level: string | null;
  applicants_count: string | null;
  apply_url: string | null;
  resume_url: string | null;
  outreach_email: string | null;
  description: string | null;
  status: JobStatus;
  match_score: number | null;
  match_reason: string | null;
  applied_date: string | null;
  notes: string | null;
  deadline: string | null;
  job_category: string | null;
  interview_date: string | null;
  offer_date: string | null;
  // Multi-source fields
  source: string | null;
  sources: string | null;   // JSON array stored as string
  source_count: number | null;
  content_hash: string | null;
  posted_at: string | null;
  freshness_score: number | null;
  tags: string | null;      // JSON array stored as string
  // Skill matching keywords (JSON arrays stored as strings)
  resume_keywords: string | null;
  jd_keywords: string | null;
  matched_keywords: string | null;
  added_keywords: string | null;
  missing_keywords: string | null;
  created_at: string;
  updated_at: string;
}

export interface CareerEvent {
  id: number;
  title: string;
  organizer: string | null;
  location: string | null;
  event_date: string | null;
  event_url: string | null;
  description: string | null;
  event_type: string;
  source: string | null;
  scraped_at: string;
}

export interface SkillData {
  skill: string;
  count: number;
  pct: number;
  onResume: boolean;
}

export interface Column {
  id: JobStatus;
  title: string;
  emoji: string;
  gradient: string;
  dotColor: string;
  cardAccent: string;
  countBg: string;
}

export interface ResumeExperience {
  id: number;
  company: string;
  title: string;
  location: string;
  start_date: string;
  end_date: string | null;
  summary: string;
  description: string;
  skills_used: string[];
  sort_order: number;
}

export interface ResumeProject {
  id: number;
  name: string;
  summary: string;
  start_date: string;
  end_date: string | null;
  location: string;
  description: string;
  tech_stack: string[];
  url: string;
  sort_order: number;
}

export interface ResumeEducation {
  id: number;
  institution: string;
  degree: string;
  field: string;
  start_date: string;
  end_date: string;
  grade: string;
  sort_order: number;
}

export interface ResumeProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export interface InterviewPrep {
  status: "none" | "generating" | "completed" | "failed";
  prepId?: number;
  intelReportUrl?: string | null;
  prepGuideUrl?: string | null;
  hasMarkdownFallback?: boolean;
  intelMarkdown?: string | null;
  prepMarkdown?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export const COLUMNS: Column[] = [
  {
    id: "filtered",
    title: "Filtered",
    emoji: "🔍",
    gradient: "from-cyan-500/10 to-transparent",
    dotColor: "bg-cyan-400",
    cardAccent: "hover:border-cyan-500/40",
    countBg: "bg-cyan-500/15 text-cyan-400",
  },
  {
    id: "saved",
    title: "Saved",
    emoji: "📌",
    gradient: "from-gray-500/10 to-transparent",
    dotColor: "bg-gray-400",
    cardAccent: "hover:border-gray-500/40",
    countBg: "bg-gray-500/15 text-gray-400",
  },
  {
    id: "applied",
    title: "Applied",
    emoji: "📨",
    gradient: "from-blue-500/10 to-transparent",
    dotColor: "bg-blue-400",
    cardAccent: "hover:border-blue-500/40",
    countBg: "bg-blue-500/15 text-blue-400",
  },
  {
    id: "interviewing",
    title: "Interviewing",
    emoji: "💬",
    gradient: "from-amber-500/10 to-transparent",
    dotColor: "bg-amber-400",
    cardAccent: "hover:border-amber-500/40",
    countBg: "bg-amber-500/15 text-amber-400",
  },
  {
    id: "offer",
    title: "Job Offer",
    emoji: "🎉",
    gradient: "from-emerald-500/10 to-transparent",
    dotColor: "bg-emerald-400",
    cardAccent: "hover:border-emerald-500/40",
    countBg: "bg-emerald-500/15 text-emerald-400",
  },
  {
    id: "rejected",
    title: "Rejected",
    emoji: "❌",
    gradient: "from-red-500/10 to-transparent",
    dotColor: "bg-red-400",
    cardAccent: "hover:border-red-500/40",
    countBg: "bg-red-500/15 text-red-400",
  },
];
