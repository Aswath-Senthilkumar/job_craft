export interface Job {
  id: string;
  link: string;
  title: string;
  companyName: string;
  companyWebsite?: string;
  companyLogo?: string;
  location: string;
  salary: string;
  postedAt: string;
  descriptionText: string;
  descriptionHtml?: string;
  applicantsCount: string;
  applyUrl: string;
  seniorityLevel: string;
  employmentType: string;
  jobFunction?: string;
  industries?: string;
  /** Multi-source tracking fields */
  source?: string;        // primary source name e.g. "remoteok", "indeed"
  sources?: string[];     // all sources this job was found on (after dedup merge)
  contentHash?: string;   // SHA-256(title+company+location) for dedup
  tags?: string[];        // skill tags from source
  freshnessScore?: number; // 0–1, 1=posted today
}

/** Normalised job from any scraper before merging */
export interface ScrapedJob {
  title: string;
  companyName: string;
  link?: string;
  applyUrl?: string;
  location?: string;
  salary?: string;
  descriptionText?: string;
  postedAt?: string;
  seniorityLevel?: string;
  applicantsCount?: string;
  employmentType?: string;
  companyWebsite?: string;
  companyLogo?: string;
  tags?: string[];
  source: string;
  externalId?: string;
}

export interface JobVerdict {
  verdict: boolean;
  reason: string;
  score: number;       // 1-10 relevance score
  is_reach: boolean;   // true if job mentions senior/4+ years but still relevant
}

export interface QueuedJob {
  job: Job;
  score: number;
  matched: string[];
  missing: string[];
  resumeKeywords: string[];
  jdKeywords: string[];
}

// Duplicate check returns null when tracker is unreachable (vs true/false)
export type DuplicateCheckResult = boolean | null;

export interface JdAnalysis {
  domain: string;
  seniority: string;
  core_stack: string[];
  business_context: string;
  methodologies: string[];
  screened_skills: string[];
}

export interface BulletPoint {
  original: string;
  improved: string | null;
}

export interface CategorizedSkills {
  languages: string;
  frameworks: string;
  dataAndMiddleware: string;
  cloudAndDevops: string;
  testingAndTools: string;
}

export interface ResumeData {
  personalInfo: {
    name: string;
    phone: string;
    email: string;
    linkedin: string;
    github: string;
    portfolio: string;
  };
  summary: string;
  education: Array<{
    institution: string;
    date: string;
    degree: string;
    gpa: string;
  }>;
  skills: CategorizedSkills;
  order: string[];
  experience: Array<{
    title: string;
    company: string;
    date: string;
    location: string;
    summary: string;
    bulletPoints: BulletPoint[];
  }>;
  projects: Array<{
    title: string;
    link: string;
    date: string;
    summary: string;
    location: string;
    bulletPoints: BulletPoint[];
  }>;
  certifications: Array<{
    name: string;
    issuer: string;
    date: string;
  }>;
  awards: Array<{
    title: string;
    issuer: string;
    date: string;
  }>;
}

/** AI returns only enhanced bullets — pipeline assembles full ResumeData from pool */
export interface EnhancedBulletResult {
  jd_analysis: JdAnalysis;
  summary: string;
  skills: CategorizedSkills;
  experience: Array<{
    title: string;
    company: string;
    bullets: BulletPoint[];
  }>;
  projects: Array<{
    name: string;
    bullets: BulletPoint[];
  }>;
}

export interface PipelineStats {
  scraped: number;
  locationFiltered: number;
  relevant: number;
  applied: number;
  skipped: number;
  errors: number;
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
}

export interface ResumeEducation {
  id: number;
  institution: string;
  degree: string;
  field: string;
  start_date: string;
  end_date: string;
  grade: string;
}

export interface ResumeProfile {
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export interface PoolSelection {
  profile: ResumeProfile;
  experiences: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  skills: CategorizedSkills;
}
