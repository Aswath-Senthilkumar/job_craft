# Job Craft

Job Craft is an end-to-end job search automation platform. It scrapes hundreds of job listings daily from 15+ sources, scores them against your resume, uses Claude AI to tailor a custom resume for each relevant role, generates a PDF, and tracks every application in a Kanban dashboard — all from a single interface.

---

## Demo Access

A test account is provided for hackathon evaluation. Credentials are included in the submission form.

---

## Architecture

npm workspaces monorepo with three packages:

```
job_craft/
  client/     React + TypeScript + Vite + Tailwind CSS   (Kanban dashboard UI)
  server/     Express + TypeScript REST API               (port 3002 locally, Railway-assigned in production)
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

Triggered from the dashboard (Run Pipeline button) or run manually from the CLI. Streams live logs to a terminal-style modal in the UI.

**Full pipeline flow:**

1. **ATS Discovery** — Claude AI discovers Ashby, Lever, and Greenhouse company board slugs based on your search keywords, so company-specific ATS boards are scraped automatically.

2. **Multi-Source Scraping** — 15 scrapers run in parallel:
   - RemoteOK, Jobicy, We Work Remotely (WWR), Remotive, HN Who's Hiring, Arbeitnow, dev.to Jobs, CareerJet, Glassdoor, Indeed, Simplify, Naukri
   - Ashby, Lever, Greenhouse (company-specific ATS boards via AI-discovered slugs)
   - Optional: LinkedIn via Apify (requires Apify API token)

3. **Merge & Deduplicate** — jobs from all sources are merged by content hash to eliminate duplicates.

4. **Freshness Filter** — drops jobs older than `MAX_AGE_DAYS` (configurable, default 14 days).

5. **Archive** — all scraped jobs are stored for historical skills trend analysis.

6. **Location Filter** — keeps only jobs matching `TARGET_COUNTRIES`. Uses city/state/country inference (US states, major cities, airport codes, Indian cities) — not just keyword matching. Remote jobs are evaluated for geographic restrictions.

7. **DB Dedup** — batch checks against your tracker DB (10 concurrent) to skip jobs already in the system.

8. **Seniority Filter** — filters by `JOB_LEVELS` (junior/mid/senior/lead/staff/principal) and `MAX_REQ_YOE` years-of-experience cap.

9. **Resume Pool Loading** — fetches your skills, experiences, and projects from the Resume Pool.

10. **Local Skill Matching** — scores each job against your resume skills without any AI calls. Jobs below `RELEVANCE_SCORE_THRESHOLD` are skipped entirely.

11. **AI Resume Tailoring (Claude)** — for each relevant job:
    - Selects the most relevant experiences and projects from your pool
    - Calls Claude to enhance bullet points, write a targeted summary, and optimise the skills section
    - Configurable tailoring intensity (1–10)

12. **PDF Generation** — assembles the tailored resume into a PDF via an external PDF backend.

13. **Cloud Upload** — PDF is uploaded to InsForge cloud storage.

14. **Post to Tracker** — job is added to the Filtered column with the resume attached, match score, matched/missing/added keywords.

15. **Skills Snapshot** — saves a skills frequency snapshot after each run for trend tracking.

### Resume Pool

The master resume database stored in InsForge. Managed through the Resume Pool tab in the dashboard.

- **Profile** — name, email, phone, location, LinkedIn, GitHub, portfolio
- **Experiences** — company, title, dates, location, summary, bullet points, skills used
- **Projects** — name, description, tech stack, URL, dates
- **Education** — institution, degree, field, dates, grade
- **Skills extraction** — paste any text (job description, resume) and AI extracts canonical skills automatically
- **Resume section order** — configurable (summary / experience / skills / projects / education)

The pipeline uses the pool to select the most relevant experiences for each job description and builds the tailored resume from this structured data. Dates, titles, and companies are never fabricated — only bullets and summaries are AI-enhanced.

### Interview Prep (AI-Generated)

Automatically triggered when a job moves to the **Interviewing** column (by drag, status click, or Gmail sync detection).

**Generation flow:**
1. Fetches job data, your resume pool selection, and any Gmail context emails for that company
2. Calls the Tinyfish agent to research the company (recent news, culture, tech stack, strategy)
3. Two parallel Claude calls:
   - **Intel Report** — company overview, recent developments, strategic context, culture signals
   - **Prep Guide** — personalised interview questions, talking points, how your experience maps to the role
4. Both documents converted to PDF via `md-to-pdf` (falls back to inline markdown if Chrome is unavailable)
5. PDFs uploaded to InsForge cloud storage and linked to the job

**UI entry points:**
- Job card badge in the Interviewing column — shows generating/ready status; click to open the prep modal
- Job detail modal — "Interview Prep" section with View Prep / Regenerate buttons

### Gmail Integration

Connect your Gmail account via OAuth2 to automatically sync job application status.

- OAuth2 popup flow — connect without leaving the dashboard
- Syncs the last 30 days of career-related emails on demand
- Classifies emails into: **applied**, **interviewing**, **rejected**, **offer**
- Only updates jobs already in your tracker — does not auto-create new jobs
- Gmail tokens are encrypted at rest (AES-256-GCM) per user
- Last sync timestamp shown in the Gmail button

**Classification logic:**
- Applied: confirmation / "thank you for applying" / "we received your application" patterns
- Interviewing: interview invite / schedule / video call patterns (checked after rejection)
- Rejected: "not moving forward" / "other candidates" / "position filled" patterns (checked first)
- Offer: offer letter / compensation / start date patterns

### Skills Trend Analysis

Tracks which skills appear most frequently across all scraped jobs over time.

- Top 50 skills ranked by frequency with percentage of jobs requiring each
- Highlights which skills are already on your resume vs. gaps to fill
- Filter by job title and location
- Historical trend chart showing skill demand changes across pipeline runs
- Export calendar events (.ics) for career events via the Events view

### Pipeline Settings

All pipeline behaviour is configured from the Settings modal in the dashboard and stored in the database (no need to edit files):

| Setting | Description |
|---------|-------------|
| Search Keywords | Comma-separated job titles / technologies to search |
| Target Countries | `United States`, `India`, `Remote`, etc. |
| Job Levels | `junior`, `mid`, `senior`, `lead`, `staff`, `principal` |
| Max Required YOE | Drop jobs requiring more than N years of experience |
| Relevance Threshold | Minimum skill match score (1–10) to proceed to AI tailoring |
| Tailoring Intensity | How aggressively Claude rewrites resume bullets (1–10) |
| Max Job Age (days) | Drop jobs older than N days |
| Resume Section Order | Customise section ordering on the generated PDF |
| Scraper Toggles | Enable/disable each of the 15 scrapers individually |
| LinkedIn URL | Search URL for LinkedIn scraping via Apify (optional) |
| Test Limit | Cap the number of jobs processed per run (for testing) |

### Authentication

- Email + password signup with email verification (OTP)
- JWT-based auth; tokens stored in localStorage with auto-refresh
- Forgot password → reset code email → new password flow
- Per-user data isolation enforced via Row-Level Security (RLS) in InsForge
- Multi-user ready: each user has their own jobs, resume pool, settings, and Gmail tokens

---

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite 6 (dev server + build)
- Tailwind CSS 3
- `@hello-pangea/dnd` — drag-and-drop Kanban
- Custom `useAuth` hook with auto token refresh

### Backend
- Express 4 + TypeScript
- `tsx watch` for development (no build step)
- `googleapis` — Gmail OAuth2 and API
- `multer` — PDF upload handling
- `@anthropic-ai/sdk` — Claude for interview prep synthesis
- `md-to-pdf` — Markdown to PDF conversion (requires Chrome/Chromium)

### Pipeline
- Node.js + TypeScript via `tsx`
- `@anthropic-ai/sdk` — Claude Haiku for ATS discovery and resume tailoring
- `cheerio` — HTML scraping
- `fast-xml-parser` — RSS/XML feed parsing
- Custom orchestrator running all scrapers in parallel

### Database & Auth
- **InsForge** (PostgreSQL-based SaaS DB with built-in auth)
- `@insforge/sdk` for all DB and auth operations
- Row-Level Security policies enforce per-user data isolation
- Cloud object storage for resume PDFs and interview prep documents

### Infrastructure
- Deployed on **Railway** (Railpack builder, single service with root `package.json`)
- Client served as static files from `client/dist/` by the Express server in production
- Pipeline spawned as a child process with SSE log streaming

---

## Pipeline Environment Variables

```
# pipeline/.env
ANTHROPIC_API_KEY=      # Required — Claude API key for resume tailoring + ATS discovery
PDF_BACKEND_URL=        # Required — PDF generation service URL
JOB_TRACKER_URL=        # Default: http://localhost:3002
AUTH_TOKEN=             # Optional — JWT token (multi-user mode)
APIFY_API_TOKEN=        # Optional — LinkedIn scraping via Apify
APIFY_ACTOR_ID=         # Optional
CAREERJET_AFFILIATE_ID= # Optional
```

Job search settings (keywords, countries, seniority, scraper toggles, etc.) are configured via the dashboard Settings modal and stored in the database — not in `.env`.

## Server Environment Variables

```
# server/.env
INSFORGE_BASE_URL=      # InsForge project URL
INSFORGE_API_KEY=       # InsForge anon key
GMAIL_CLIENT_ID=        # Google OAuth2 client ID
GMAIL_CLIENT_SECRET=    # Google OAuth2 client secret
GMAIL_REDIRECT_URI=     # OAuth callback URL
GMAIL_ENCRYPTION_KEY=   # 64-char hex key for AES-256-GCM token encryption
ANTHROPIC_API_KEY=      # Claude API key for interview prep generation
TINYFISH_API_KEY=       # Tinyfish agent key for company research
CLIENT_URL=             # Frontend URL (for CORS)
PORT=                   # Server port (default 3002 locally; set automatically by Railway in production)
```

---

## Local Development

### Prerequisites
- Node.js v18+
- InsForge project credentials
- Anthropic API key
- Google Cloud project with Gmail API enabled (for Gmail integration)

### Setup

```bash
# Install all workspace dependencies from root
npm install

# Configure environment files
cp server/.env.example server/.env
cp pipeline/.env.example pipeline/.env
# Edit both files with your credentials
```

### Running

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend
cd client && npm run dev

# Terminal 3 — Pipeline (optional, can also run from UI)
cd pipeline && npm run pipeline
```

The dashboard will be available at `http://localhost:5174`.

---

## License

Privately owned project.
