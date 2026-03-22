# Job Craft

Job Craft is an end-to-end job search automation platform. It scrapes hundreds of job listings daily from 15+ sources, scores them against your resume, uses **Claude (Anthropic)** to tailor a custom resume for each relevant role, generates a PDF, and tracks every application in a Kanban dashboard, all from a single interface.

---

## AI & Services

Job Craft is built on three core external services that power its intelligence layer:

### Claude - Anthropic

Claude is used at three distinct points in the platform:

- **ATS Discovery**: Claude identifies which companies use Ashby, Lever, or Greenhouse ATS boards based on the user's search keywords, so company-specific job boards are scraped automatically without manual configuration.
- **Resume Tailoring**: For each relevant job, Claude (Haiku) selects the best-fit experiences and projects from the Resume Pool, rewrites bullet points to reflect the job's requirements, crafts a targeted professional summary, and optimises the skills section at a configurable intensity level. Dates, titles, and companies are never fabricated; only the framing is AI-enhanced.
- **Interview Prep Synthesis**: Claude generates two documents per role: a company Intel Report (strategic context, culture, recent developments) and a personalised Prep Guide (tailored interview questions, talking points, experience-to-role mapping). Both are exported as PDFs and attached directly to the job in the tracker.

### Tinyfish

Tinyfish is used as a web research agent in the Interview Prep flow:

- When a job moves to Interviewing status, a Tinyfish agent is dispatched to research the company, surfacing recent news, product strategy, engineering culture, tech stack, and hiring context
- The research output feeds directly into Claude's Intel Report prompt, grounding the AI output in real, up-to-date company information rather than training data alone

### InsForge

InsForge serves as the full backend data layer: database, authentication, and cloud storage.

- **PostgreSQL database** with Row-Level Security (RLS) policies ensuring complete per-user data isolation across all tables (jobs, resume pool, settings, Gmail tokens, interview prep, skills snapshots)
- **Auth system**: email/password signup with OTP verification, JWT sessions with auto-refresh, forgot password / reset code flow
- **Cloud object storage**: all generated resume PDFs and interview prep documents are uploaded to InsForge storage and served via authenticated proxy routes
- Multi-user ready: every user has a fully isolated workspace; no data leaks between accounts

---

## Architecture

npm workspaces monorepo with three packages:

```
job_craft/
  client/     React + TypeScript + Vite + Tailwind CSS   (Kanban dashboard UI)
  server/     Express + TypeScript REST API               (Railway-assigned port in production)
  pipeline/   Node.js + TypeScript automation engine      (spawned from dashboard)
```

All three communicate over HTTP. The pipeline runs as a child process spawned by the server, streaming live logs back to the UI via Server-Sent Events (SSE).

---

## Feature Overview

### Kanban Application Tracker

The main dashboard is a drag-and-drop Kanban board with six status columns:

| Column | Purpose |
|--------|---------|
| **Filtered** | Jobs auto-populated by the pipeline after skill scoring |
| **Saved** | Jobs bookmarked for later |
| **Applied** | Applications submitted (manual or Gmail-detected) |
| **Interviewing** | Active interview processes |
| **Job Offer** | Offers received |
| **Rejected** | Declined / rejection received |

- Drag cards between columns to update status
- Click any card to open the full job detail modal (description, links, notes, dates, keyword analysis)
- Multi-select mode: select individual cards or all cards in a column, then bulk-delete
- Add jobs manually via the Add Job button
- Search, sort (by date, score, company), filter by location country, and filter by source
- Per-column job counts with conversion rate stats shown in the header bar
- Delete all rejected jobs in one click (trash icon appears on hover)

### Automated Job Pipeline

Triggered from the dashboard (Run Pipeline button) or run manually from the CLI. Streams live logs to a terminal-style modal in the UI via Server-Sent Events (SSE). The pipeline runs as a child process spawned by the Express server so it does not block any API requests during execution.

**Full pipeline flow:**

#### Step 1 - ATS Discovery (Claude)

Before scraping begins, Claude identifies which companies use Ashby, Lever, or Greenhouse as their ATS based on the user's search keywords. The prompt instructs Claude to return a JSON object of `{ ashby: string[], lever: string[], greenhouse: string[] }` company slugs. These slugs are passed directly into the three ATS scrapers so company-specific job boards are scraped automatically without the user having to know or configure any company names manually.

#### Step 2 - Multi-Source Scraping (15 scrapers in parallel)

All 15 scrapers run concurrently via `Promise.allSettled`. Each scraper is independently togglable from the Settings modal. A failed scraper logs a warning and returns an empty array; it never takes down the rest of the run.

**Free public APIs (no auth required):**

- **RemoteOK** - Calls the public JSON API at `remoteok.com/api`. Returns all active remote listings as a flat array. Filtered in-scraper by keyword match against title/tags and location relevance before adding to the queue.

- **Jobicy** - Calls `jobicy.com/api/v2/remote-jobs` with `geo` and `tag` query params derived from the user's target countries and search keywords. Returns up to 50 listings per keyword-geo combination.

- **We Work Remotely (WWR)** - Parses three RSS feeds (all remote jobs, programming, data science) using `fast-xml-parser`. No API key needed. Each item's `<description>` contains the full job HTML which is stripped to plain text.

- **Remotive** - Calls `remotive.com/api/remote-jobs` filtered by category (software-dev, devops-sysadmin, data, etc.). Returns up to 100 listings per category. Keyword match is applied against job title before adding.

- **HN Who's Hiring** - Uses the Algolia HN search API to find the latest monthly "Who is Hiring" thread, then searches that thread's comments for the user's keywords. Each matching comment is parsed as a job listing. The entire JD is the raw comment text.

- **Arbeitnow** - Calls the free `arbeitnow.com/api/job-board-api` with `tags[]` (keyword) and `location` params. Covers European and remote tech jobs. Runs for each keyword against each target geo.

- **dev.to** - Calls `dev.to/api/listings?category=jobs` filtered by tag. Returns markdown body listings posted by companies directly on dev.to.

- **Simplify** - Fetches the daily-updated `listings.json` from the `SimplifyJobs/New-Grad-Positions` GitHub repository. Covers curated new grad and early-career software engineering roles from hundreds of companies. Filtered by keyword match against title and company name.

**HTML scrapers (no API key, uses cheerio):**

- **Glassdoor** - Sends a keyword search request to `glassdoor.com/Job/jobs.htm` sorted by date and parses the returned HTML with `cheerio` to extract job cards. Structured data is embedded as JSON-LD in the page and extracted alongside the HTML.

- **Indeed** - Scrapes `indeed.com` (or the country-specific domain, e.g., `indeed.co.in` for India) with keyword and location params. HTML is parsed with `cheerio`. Domain and default location are derived automatically from the user's primary target country setting.

- **Naukri** - Scrapes `naukri.com` search result pages with `cheerio`. India's largest job board with no public API. The scraper first attempts to extract structured job data embedded as JSON inside the page scripts, then falls back to HTML card parsing if the embedded data is absent.

**Company-specific ATS APIs (public, no auth):**

- **Ashby** - Calls `api.ashbyhq.com/posting-api/job-board/{slug}` for each slug discovered by Claude in Step 1. Returns all open roles at that company with full description, location, and apply URL. The Ashby Job Board API is publicly documented and requires no authentication.

- **Lever** - Calls `api.lever.co/v0/postings/{slug}?mode=json` for each Lever company slug. Returns structured posting objects including plain-text description, categories, and apply URL. The Lever Postings API is public with no rate limiting on GET requests.

- **Greenhouse** - Calls `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` for each board token. The `content=true` param includes the full job description HTML in the response. Greenhouse's Job Board API is publicly documented and requires no key.

**Optional (requires external service):**

- **LinkedIn via Apify** - If a LinkedIn search URL and Apify API key are configured in Settings, the pipeline calls an Apify actor to scrape LinkedIn job search results. This is the only scraper that requires a paid external service; all others are free.

#### Step 3 - Merge and Deduplicate

All arrays from Step 2 are flattened into a single list. Each job is fingerprinted by a SHA-256 hash of `title + company` (normalised to lowercase). Duplicate entries from overlapping sources are dropped, keeping the first occurrence.

#### Step 4 - Freshness Filter

Jobs are dropped if their `postedAt` date is older than `MAX_AGE_DAYS` (default 14 days). Jobs with no parseable date are kept to avoid dropping valid listings from sources that do not publish dates.

#### Step 5 - Archive (InsForge)

All jobs that passed Steps 3-4, before any location or relevance filtering, are bulk-upserted into the InsForge archive table. This raw snapshot powers the Skills Trend Analysis feature, which tracks which skills appear most frequently across all scraped jobs over time regardless of whether they matched the user's profile.

#### Step 6 - Location Filter

Each job is evaluated against the user's `TARGET_COUNTRIES` setting using a multi-layer inference engine rather than naive keyword matching:

- US state abbreviations (2-letter), major US cities, US airport codes
- Indian city and state names
- Remote geographic restriction detection (rejects jobs that say "US only" or "APAC only" if the user's target does not include that region)
- Placeholder locations (N/A, TBD, "Anywhere") pass through
- A job with a real, specific non-target location is dropped immediately without falling back to the description

#### Step 7 - DB Dedup (InsForge)

Each surviving job is checked against the user's tracker database to skip any job already in the system (any status column). Checks run in batches of 10 concurrent requests to avoid overwhelming the DB connection pool.

#### Step 8 - Seniority Filter

Job titles and descriptions are scanned for level signals against the user's `JOB_LEVELS` setting (junior / mid / senior / lead / staff / principal). Additionally, explicit years-of-experience requirements parsed from the description are checked against `MAX_REQ_YOE`: set to `-1` to disable, `0` to target freshers only (drops any job requiring more than 0 YOE), or any positive integer to cap at that many years.

#### Step 9 - Resume Pool Loading (InsForge)

The user's full resume pool is fetched from InsForge: profile, all experiences with bullet points and skills, all projects, education, and the consolidated keyword/skills list. This is the only source of truth for what goes into the tailored resume - the pipeline never fabricates any structural content.

#### Step 10 - Local Skill Matching

Each job's title, tags, and description are scanned for matches against the user's pool skills. No AI is involved. A relevance score (1-10) is computed from the proportion of matched skills weighted by recency and importance signals. Jobs below `RELEVANCE_SCORE_THRESHOLD` are dropped before any Claude call is made, keeping API costs proportional to actual relevance.

#### Step 11 - AI Resume Tailoring (Claude Haiku)

For each job that clears the threshold, the resume pool selection endpoint is called to pick the most relevant experiences and projects for that specific JD. Claude Haiku then receives:

- The selected pool items (experiences, projects, skills, profile)
- The full job description
- The configured tailoring intensity (1-10)

Claude returns enhanced bullet points, a targeted professional summary, and an optimised skills list. Dates, titles, companies, and all factual structure always come from the pool - Claude only improves the framing and language. The original and enhanced versions of each bullet are stored side by side in `resume_data` for potential future diff-review.

#### Step 12 - PDF Generation

The tailored resume JSON (pool structure + Claude enhancements) is assembled into a resume layout and sent to an external PDF rendering backend (`PDF_BACKEND_URL`). The section order is configurable per user (summary / experience / skills / projects / education).

#### Step 13 - Cloud Upload (InsForge Storage)

The generated PDF binary is uploaded to InsForge cloud storage under the user's namespace (`{userId}/resume-{company}-{title}.pdf`). The returned public URL is attached to the job record.

#### Step 14 - Post to Tracker (InsForge)

The job is inserted into the user's tracker database with status `"filtered"`, the resume PDF URL, the match score, and the full keyword analysis (matched skills, missing skills, skills added by Claude). It appears immediately in the Filtered column of the Kanban board.

#### Step 15 - Skills Snapshot (InsForge)

After all jobs are posted, a skills frequency snapshot is saved: for each skill, how many scraped jobs in this run mentioned it. This time-series data powers the historical trend chart in the Skills Trend Analysis tab, showing how demand for specific skills changes across pipeline runs.

### Resume Pool

The master resume database stored in **InsForge**. Managed through the Resume Pool tab in the dashboard.

- **Profile**: name, email, phone, location, LinkedIn, GitHub, portfolio
- **Experiences**: company, title, dates, location, summary, bullet points, skills used
- **Projects**: name, description, tech stack, URL, dates
- **Education**: institution, degree, field, dates, grade
- **Skills extraction**: paste any text and **Claude** extracts canonical skills automatically
- **Resume section order**: configurable (summary / experience / skills / projects / education)

The pipeline selects the most relevant items from the pool per job description. Structure (dates, titles, companies) is always sourced from the pool; **Claude** only enhances the framing.

### Interview Prep (AI-Generated)

Automatically triggered when a job moves to the **Interviewing** column.

**Generation flow:**
1. Fetches job data, resume pool selection, and any Gmail context emails for that company
2. **Tinyfish** agent researches the company: recent news, product strategy, engineering culture, tech stack
3. Two parallel **Claude** calls:
   - **Intel Report**: company overview, strategic context, culture signals, grounded in live Tinyfish research
   - **Prep Guide**: personalised interview questions, talking points, experience-to-role mapping
4. Both documents converted to PDF and uploaded to **InsForge** cloud storage

**UI entry points:**
- Job card badge in the Interviewing column: shows generating/ready status; click to open the prep modal
- Job detail modal: "Interview Prep" section with View Prep / Regenerate buttons

### Gmail Integration

Connect your Gmail account via OAuth2 to automatically sync job application status.

- OAuth2 popup flow: connect without leaving the dashboard
- Syncs the last 30 days of career-related emails on demand
- Classifies emails into: **applied**, **interviewing**, **rejected**, **offer**
- Only updates jobs already in the tracker; does not auto-create new jobs
- Gmail tokens are encrypted at rest (AES-256-GCM) and stored per-user in **InsForge**

### Skills Trend Analysis

Tracks which skills appear most frequently across all scraped jobs over time.

- Top 50 skills ranked by frequency with percentage of jobs requiring each
- Highlights which skills are already on your resume vs. gaps to fill
- Filter by job title and location
- Historical trend chart showing skill demand changes across pipeline runs

### Pipeline Settings

All pipeline behaviour is configured from the Settings modal in the dashboard and stored in **InsForge** with no files to edit:

| Setting | Description |
|---------|-------------|
| Search Keywords | Comma-separated job titles / technologies to search |
| Target Countries | `United States`, `India`, `Remote`, etc. |
| Job Levels | `junior`, `mid`, `senior`, `lead`, `staff`, `principal` |
| Max Required YOE | Drop jobs requiring more than N years of experience |
| Relevance Threshold | Minimum skill match score (1-10) to proceed to Claude tailoring |
| Tailoring Intensity | How aggressively Claude rewrites resume bullets (1-10) |
| Max Job Age (days) | Drop jobs older than N days |
| Resume Section Order | Customise section ordering on the generated PDF |
| Scraper Toggles | Enable/disable each of the 15 scrapers individually |
| LinkedIn URL | Search URL for LinkedIn scraping via Apify (optional) |
| Test Limit | Cap the number of jobs processed per run (for testing) |

### Authentication

Powered by **InsForge Auth**:

- Email + password signup with OTP email verification
- JWT sessions with automatic token refresh
- Forgot password: reset code email, then new password form
- Row-Level Security (RLS) in InsForge enforces complete per-user data isolation
- Multi-user ready: each user has their own jobs, resume pool, settings, and Gmail tokens

---

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite 6 (dev server + build)
- Tailwind CSS 3
- `@hello-pangea/dnd` - drag-and-drop Kanban
- Custom `useAuth` hook with auto token refresh

### Backend
- Express 4 + TypeScript
- `googleapis` - Gmail OAuth2 and API
- **`@anthropic-ai/sdk`** - Claude for interview prep synthesis
- **`@insforge/sdk`** - database, auth, and storage
- `md-to-pdf` - Markdown to PDF conversion

### Pipeline
- Node.js + TypeScript
- **`@anthropic-ai/sdk`** - Claude Haiku for ATS discovery and resume tailoring
- **Tinyfish** - company web research agent
- `cheerio` - HTML scraping
- `fast-xml-parser` - RSS/XML feed parsing
- Custom orchestrator running all scrapers in parallel

### Infrastructure
- Deployed on **Railway** (Railpack builder)
- Client served as static files by the Express server in production
- Pipeline spawned as a child process with SSE log streaming

---

## Future Enhancements

### ReWrite: Resume Editor with Diff Tracking and Manual Refinement

After the pipeline generates a tailored resume, users should be able to review AI changes, accept/reject individual bullet improvements, manually rewrite any section, reorder content, and regenerate the PDF, all from the dashboard.

- Diff view: original pool bullets vs. **Claude**-enhanced bullets side by side with per-bullet accept/reject toggles
- Inline free-text editing on any field (summary, bullets, skills)
- Drag-and-drop reordering of bullet points within each experience/project block
- "Regenerate PDF" triggers a new PDF build from the edited content and replaces the stored file

### Networking Outreach

For each job in the tracker, find potential contacts at the company and generate personalised outreach copy, LinkedIn connection notes and cold emails, using **Claude**, based on the role and the user's background.

### Career Events

Search and display local career fairs, tech meetups, and networking events matched to the user's location and job keywords. Infrastructure (DB table, route shell, UI component) is already partially in place.

### Push Notifications

Notify users when background tasks complete, without requiring them to keep the dashboard open.

- Browser push notification when the pipeline finishes: how many jobs were added, score range, and a direct link to the Filtered column
- Push notification when interview prep documents are ready: company name, job title, and a direct link to open the prep modal
- In-app notification bell with a history of recent events for users who missed the push

### Pipeline Job Queue Cache

Persist the scored-but-unprocessed job queue after each pipeline run. On the next run, serve from the cache instead of re-scraping, until the cache is depleted or jobs go stale. Reduces redundant scraping when running the pipeline frequently with a low job limit.

---

## License

Privately owned project.
