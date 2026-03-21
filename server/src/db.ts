import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "jobs.db");
const POOL_DB_PATH = path.join(__dirname, "..", "resume-pool.db");

const db = new Database(DB_PATH);
export const poolDb = new Database(POOL_DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
poolDb.pragma("journal_mode = WAL");
poolDb.pragma("foreign_keys = ON");

// Drop and recreate if the schema changed (dev mode)
const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='jobs'").get() as { sql: string } | undefined;
if (tableInfo && !tableInfo.sql.includes("'filtered'")) {
  db.exec("DROP TABLE jobs");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    company_url TEXT,
    job_link TEXT UNIQUE,
    location TEXT,
    salary TEXT,
    seniority_level TEXT,
    applicants_count TEXT,
    apply_url TEXT,
    resume_url TEXT,
    outreach_email TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'applied' CHECK(status IN ('filtered', 'saved', 'applied', 'interviewing', 'offer', 'rejected')),
    match_score INTEGER,
    match_reason TEXT,
    applied_date TEXT,
    notes TEXT,
    deadline TEXT,
    job_category TEXT,
    interview_date TEXT,
    offer_date TEXT,
    source TEXT DEFAULT 'unknown',
    sources TEXT,
    source_count INTEGER DEFAULT 1,
    content_hash TEXT,
    posted_at TEXT,
    freshness_score REAL,
    tags TEXT,
    resume_keywords TEXT,
    jd_keywords TEXT,
    matched_keywords TEXT,
    added_keywords TEXT,
    missing_keywords TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_job_link ON jobs(job_link);
`);

// Safe migration: add columns if they don't exist in an older DB
function safeAddColumn(sql: string) {
  try { db.exec(sql); } catch (err: any) {
    if (!err.message.includes("duplicate column")) {
      console.error(`[DB Migration] ${err.message}`);
    }
  }
}
safeAddColumn("ALTER TABLE jobs ADD COLUMN deadline TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN job_category TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN interview_date TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN offer_date TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN match_reason TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN source TEXT DEFAULT 'unknown'");
safeAddColumn("ALTER TABLE jobs ADD COLUMN sources TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN source_count INTEGER DEFAULT 1");
safeAddColumn("ALTER TABLE jobs ADD COLUMN content_hash TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN posted_at TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN freshness_score REAL");
safeAddColumn("ALTER TABLE jobs ADD COLUMN tags TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN resume_keywords TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN jd_keywords TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN matched_keywords TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN added_keywords TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN missing_keywords TEXT");
safeAddColumn("ALTER TABLE jobs ADD COLUMN resume_data TEXT");

// Resume pool migrations (on poolDb)
function safeAddPoolColumn(sql: string) {
  try { poolDb.exec(sql); } catch (err: any) {
    if (!err.message.includes("duplicate column")) {
      console.error(`[Pool DB Migration] ${err.message}`);
    }
  }
}
safeAddPoolColumn("ALTER TABLE resume_profile ADD COLUMN location TEXT DEFAULT ''");
safeAddPoolColumn("ALTER TABLE resume_experiences ADD COLUMN summary TEXT DEFAULT ''");
safeAddPoolColumn("ALTER TABLE resume_projects ADD COLUMN summary TEXT DEFAULT ''");
safeAddPoolColumn("ALTER TABLE resume_projects ADD COLUMN start_date TEXT DEFAULT ''");
safeAddPoolColumn("ALTER TABLE resume_projects ADD COLUMN end_date TEXT");
safeAddPoolColumn("ALTER TABLE resume_projects ADD COLUMN location TEXT DEFAULT ''");

// Skill snapshots — daily snapshot of top skills across all job descriptions
db.exec(`
  CREATE TABLE IF NOT EXISTS skill_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    total_jobs INTEGER DEFAULT 0,
    skills_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_date ON skill_snapshots(date);
`);

// Career events — fairs, meetups, networking events
db.exec(`
  CREATE TABLE IF NOT EXISTS career_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    organizer TEXT,
    location TEXT,
    event_date TEXT,
    event_url TEXT UNIQUE,
    description TEXT,
    event_type TEXT DEFAULT 'career_fair',
    source TEXT,
    scraped_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_date ON career_events(event_date);
`);

// Scraped jobs archive — stores ALL jobs ever scraped (not just relevant ones)
// Used for historical skills-in-demand analysis across all pipeline runs
db.exec(`
  CREATE TABLE IF NOT EXISTS scraped_jobs_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    location TEXT,
    description TEXT,
    source TEXT,
    content_hash TEXT UNIQUE,
    scraped_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_archive_hash ON scraped_jobs_archive(content_hash);
  CREATE INDEX IF NOT EXISTS idx_archive_scraped ON scraped_jobs_archive(scraped_at);
`);

// Pipeline settings — user-configurable settings stored in DB (not .env)
db.exec(`
  CREATE TABLE IF NOT EXISTS pipeline_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Seed defaults (INSERT OR IGNORE so existing values are preserved)
const SETTING_DEFAULTS: Record<string, string> = {
  SEARCH_KEYWORDS: "",
  TARGET_COUNTRIES: "",
  LINKEDIN_SEARCH_URL: "",
  RELEVANCE_SCORE_THRESHOLD: "5",
  TAILORING_INTENSITY: "5",
  BATCH_DELAY_MS: "2000",
  APIFY_JOB_COUNT: "100",
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
  SCRAPE_CAREERJET: "false",
  SCRAPE_GLASSDOOR: "false",
  SCRAPE_INDEED: "true",
  SCRAPE_SIMPLIFY: "true",
  SCRAPE_NAUKRI: "false",
  SCRAPE_ASHBY: "true",
  SCRAPE_LEVER: "true",
  SCRAPE_GREENHOUSE: "true",
};

const seedStmt = db.prepare("INSERT OR IGNORE INTO pipeline_settings (key, value) VALUES (?, ?)");
const seedTx = db.transaction(() => {
  for (const [k, v] of Object.entries(SETTING_DEFAULTS)) {
    seedStmt.run(k, v);
  }
});
seedTx();

// Resume pool — stored in separate DB so wiping jobs.db doesn't lose pool data
poolDb.exec(`
  CREATE TABLE IF NOT EXISTS resume_profile (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    linkedin TEXT DEFAULT '',
    github TEXT DEFAULT '',
    portfolio TEXT DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO resume_profile (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS resume_experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT,
    description TEXT DEFAULT '',
    skills_used TEXT DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resume_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    tech_stack TEXT DEFAULT '[]',
    url TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resume_education (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institution TEXT NOT NULL,
    degree TEXT NOT NULL,
    field TEXT DEFAULT '',
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    grade TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export default db;
