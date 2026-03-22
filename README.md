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

Triggered from the dashboard (Run Pipeline button) or run manually from the CLI. Streams live logs to a terminal-style modal in the UI.

**Full pipeline flow:**

1. **ATS Discovery** *(Claude)*: discovers Ashby, Lever, and Greenhouse company board slugs based on search keywords so company-specific ATS boards are scraped automatically.

2. **Multi-Source Scraping** - 15 scrapers run in parallel:
   - RemoteOK, Jobicy, We Work Remotely (WWR), Remotive, HN Who's Hiring, Arbeitnow, dev.to Jobs, CareerJet, Glassdoor, Indeed, Simplify, Naukri
   - Ashby, Lever, Greenhouse (company-specific ATS boards via AI-discovered slugs)
   - Optional: LinkedIn via Apify

3. **Merge & Deduplicate**: jobs from all sources are merged by content hash to eliminate duplicates.

4. **Freshness Filter**: drops jobs older than the configured maximum age (default 14 days).

5. **Archive**: all scraped jobs are stored in **InsForge** for historical skills trend analysis.

6. **Location Filter**: keeps only jobs matching target countries using city/state/country inference (US states, major cities, airport codes, Indian cities) rather than simple keyword matching.

7. **DB Dedup** *(InsForge)*: batch checks against the tracker DB (10 concurrent) to skip jobs already in the system.

8. **Seniority Filter**: filters by job level (junior/mid/senior/lead/staff/principal) and years-of-experience cap.

9. **Resume Pool Loading** *(InsForge)*: fetches the user's skills, experiences, and projects.

10. **Local Skill Matching**: scores each job against resume skills with no AI calls. Jobs below the relevance threshold are dropped before any Claude usage.

11. **AI Resume Tailoring** *(Claude Haiku)*: for each relevant job, selects the best-fit pool items and calls Claude to enhance bullets, write a targeted summary, and optimise skills at configurable intensity.

12. **PDF Generation**: assembles the tailored resume into a PDF via an external PDF backend.

13. **Cloud Upload** *(InsForge Storage)*: PDF is uploaded to InsForge cloud storage.

14. **Post to Tracker** *(InsForge)*: job is added to the Filtered column with resume attached, match score, and matched/missing/added keywords.

15. **Skills Snapshot** *(InsForge)*: saves a skill frequency snapshot after each run for trend tracking.

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
