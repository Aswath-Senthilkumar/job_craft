# Job Craft — Claude Instructions

## Project Overview

**Job Craft** is a full-stack job search automation platform built with Claude (Anthropic) as the core AI engine. It scrapes job boards from 15+ sources, scores jobs against a structured resume pool, uses Claude to tailor resumes per job, generates PDFs, and tracks all applications in a Kanban dashboard. Interview prep documents are auto-generated via Claude + Tinyfish research when a job moves to Interviewing status.

## Architecture

npm workspaces monorepo with 3 packages:

```
job_craft/
  client/     React + TypeScript + Vite + Tailwind (Kanban dashboard UI)
  server/     Express + TypeScript REST API (port 3002 locally, Railway-assigned in production)
  pipeline/   Node.js + TypeScript automation pipeline (spawned by server as child process)
```

Deployed on Railway. Client is built to `client/dist/` and served as static files by Express in production. The pipeline is NOT a separate service — it is spawned by the server on demand and streams output via SSE.

## Dev Commands

```bash
# Server (from server/)
npm run dev          # tsx watch src/index.ts

# Client (from client/)
npm run dev          # vite dev server (port 5174)

# Pipeline (from pipeline/)
npm run pipeline     # tsx src/index.ts
```

## Database & Auth

- **Backend**: InsForge PostgreSQL (multi-tenant SaaS DB with built-in auth)
- **Client**: `@insforge/sdk` via `server/src/insforge-client.ts`
- **Auth**: JWT-based. Two client modes:
  - Anon singleton (`insforge`) — used for auth operations (login, signup, reset)
  - Per-request authenticated client (`createAuthenticatedClient(token)`) — enforces RLS
- All DB adapter methods in `server/src/db-adapter.ts` accept an optional `client` param. Pass the per-request authenticated client to enforce RLS; omit to use the anon singleton (pipeline use).
- **RLS**: Every table has Row-Level Security policies scoped to `auth.uid()`. Each user only sees their own data.

## Key Files

| File | Purpose |
|------|---------|
| `pipeline/src/index.ts` | Main pipeline entry point — full 15-step execution flow |
| `pipeline/src/config.ts` | Settings loaded from server DB at startup, `.env` fallback |
| `pipeline/src/services/gemini.ts` | `customizeResume()` — Claude Haiku resume tailoring (filename kept as gemini.ts for historical reasons; uses Anthropic SDK internally) |
| `pipeline/src/services/ats-discovery.ts` | Discovers company ATS board slugs via Claude |
| `pipeline/src/services/scrapers/orchestrator.ts` | Runs all 15 scrapers in parallel |
| `pipeline/src/services/location-filter.ts` | Country-level location filter with city/state/airport inference |
| `pipeline/src/services/seniority-filter.ts` | Filters by JOB_LEVELS and MAX_REQ_YOE |
| `pipeline/src/services/skill-matcher.ts` | Local skill scoring (no AI) |
| `pipeline/src/prompts/resume.ts` | Claude prompt templates for resume enhancement |
| `server/src/db-adapter.ts` | InsForge DB adapter — all data access methods |
| `server/src/insforge-client.ts` | InsForge SDK singleton + per-request client factory |
| `server/src/middleware/auth.ts` | JWT auth middleware (attaches `req.user`, `req.insforgeClient`) |
| `server/src/routes/auth.ts` | Auth endpoints: signup, login, verify, resend, refresh, logout, forgot-password, reset-password |
| `server/src/routes/jobs.ts` | Jobs CRUD + status PATCH (triggers interview prep on interviewing) |
| `server/src/routes/gmail.ts` | Gmail OAuth2 connect/disconnect/sync with AES-256-GCM token encryption |
| `server/src/routes/pipeline.ts` | Spawns pipeline child process, streams SSE logs |
| `server/src/routes/interview-prep.ts` | Interview prep CRUD + async generation trigger |
| `server/src/routes/resume-pool.ts` | Resume pool CRUD (profile, experiences, projects, education, keywords, select, upload) |
| `server/src/routes/settings.ts` | Pipeline config stored in DB, read/written per user |
| `server/src/routes/skills.ts` | Skills trend data: current frequencies, snapshots, filters, archive |
| `server/src/services/prep-generator.ts` | Orchestrates full prep gen: Tinyfish research → Claude → PDF → InsForge upload |
| `server/src/services/tinyfish-research.ts` | Tinyfish agent wrapper for company web research |
| `server/src/services/claude-synthesis.ts` | Claude prompts for intel report + personalised prep guide |
| `client/src/App.tsx` | Root React component — Kanban board, all modals, header bars |
| `client/src/api.ts` | All client-side API calls to the server |
| `client/src/hooks/useAuth.ts` | Auth hook: login, signup, verify, forgotPassword, resetPassword, logout, auto-refresh |
| `client/src/components/AuthPage.tsx` | Multi-view auth UI: login / signup / verify / forgot / reset / reset-success |
| `client/src/types.ts` | Shared TypeScript types for client |
| `pipeline/src/types.ts` | Shared TypeScript types for pipeline |

## Pipeline Flow (15 Steps)

1. **ATS Discovery** — Claude discovers Ashby/Lever/Greenhouse company board slugs from SEARCH_KEYWORDS
2. **Scrape all sources** — 15 scrapers in parallel: RemoteOK, Jobicy, HN Hiring, WWR, Arbeitnow, Remotive, DevTo, CareerJet, Glassdoor, Indeed, Simplify, Naukri, Ashby, Lever, Greenhouse + optional LinkedIn via Apify
3. **Merge + deduplicate** — by content hash across all sources
4. **Freshness filter** — drop jobs older than `MAX_AGE_DAYS`
5. **Archive** — store all scraped jobs in InsForge for skills trend analysis
6. **Location filter** — keep only jobs in `TARGET_COUNTRIES` using city/state/country inference (not just keyword matching)
7. **DB dedup** — batch check against tracker DB (concurrency: 10)
8. **Seniority filter** — filter by `JOB_LEVELS` and `MAX_REQ_YOE`
9. **Load resume pool** — fetch skills/profile/experiences from server (`/api/resume-pool/*`)
10. **Local skill matching** — score each job vs resume skills (no AI); drop below `RELEVANCE_SCORE_THRESHOLD`
11. **AI resume tailoring** via Claude Haiku — enhance bullets, summary, skills per job at configurable intensity
12. **Assemble resume** from pool structure + AI enhancements
13. **Generate PDF** via external PDF backend (`PDF_BACKEND_URL`)
14. **Upload PDF** to InsForge cloud storage
15. **Post job + attach resume** to tracker DB + save skills snapshot

## Auth Flow

- **Signup**: `POST /api/auth/signup` → InsForge creates user → OTP sent to email → `POST /api/auth/verify` with OTP
- **Login**: `POST /api/auth/login` → `signInWithPassword({ email, password })` → JWT returned
- **Refresh**: `POST /api/auth/refresh` → new access + refresh tokens
- **Forgot password**: `POST /api/auth/forgot-password` → `sendResetPasswordEmail({ email })` → code sent to email
- **Reset password**: `POST /api/auth/reset-password` → `exchangeResetPasswordToken({ email, code })` → `resetPassword({ newPassword, otp: token })`
- Client stores `auth_token` and `refresh_token` in localStorage. `authFetch()` in `api.ts` auto-retries on 401 with token refresh.

## Interview Prep Flow

Triggered automatically when a job transitions to `"interviewing"` status (drag, status click, or Gmail sync).

1. `triggerPrepIfNew(jobId, client)` — fire-and-forget, called from `jobs.ts` PATCH and `gmail.ts` sync
2. Creates `interview_prep` row with `status: "generating"`
3. Background `generateInterviewPrep()` runs:
   - Fetches job data + resume pool selection + Gmail email context for that company
   - Calls Tinyfish agent for live company web research
   - Two parallel Claude calls: intel report markdown + prep guide markdown
   - Converts both to PDF via `md-to-pdf` (falls back to inline markdown if Chrome unavailable)
   - Uploads PDFs to InsForge `resumes` bucket at `{userId}/interview-prep-{company}-*.pdf`
   - Updates row to `status: "completed"` with PDF URLs

## Gmail Integration

- OAuth2 popup flow — user connects Gmail without leaving the dashboard
- Tokens encrypted at rest with AES-256-GCM, stored per-user in InsForge (`gmail_tokens` table)
- Sync scans the last 30 days of emails, classifies them, and updates matching tracker jobs only
- Classification order: rejection checked FIRST (to avoid "not moving forward" matching interview patterns), then interviewing, then applied, then offer
- Does NOT auto-create jobs from Gmail — only updates existing tracker entries

## Resume Pool System

The user's master resume data stored in InsForge. The pipeline:
- Fetches skills/keywords from `/api/resume-pool/keywords`
- Fetches profile from `/api/resume-pool/profile`
- Calls `/api/resume-pool/select` with JD keywords to pick relevant experiences/projects
- Claude only enhances bullets and summary; structure (dates, titles, companies) always comes from the pool

## Claude Usage (Anthropic SDK)

Three distinct Claude integrations:

1. **ATS Discovery** (`pipeline/src/services/ats-discovery.ts`) — Claude identifies which companies use Ashby/Lever/Greenhouse from SEARCH_KEYWORDS. Model: `claude-haiku-4-5-20251001`.

2. **Resume Tailoring** (`pipeline/src/services/gemini.ts`, `pipeline/src/prompts/resume.ts`) — Takes pool selection + job description, returns enhanced bullets, summary, skills, jd_analysis. Model: `claude-haiku-4-5-20251001`. Note: file is named `gemini.ts` for historical reasons; uses Anthropic SDK internally.

3. **Interview Prep Synthesis** (`server/src/services/claude-synthesis.ts`) — Two parallel calls: `generateIntelReport()` and `generatePrepGuide()`. Fed with job data, resume pool selection, Gmail email context, and Tinyfish research output. Model: `claude-sonnet-4-6` (or latest available).

## Location Filter Details

`pipeline/src/services/location-filter.ts` — multi-layer inference:
- US state abbreviations (2-letter), major US cities, US airport codes
- Indian cities and state names
- Remote job geographic restriction detection (US-only, APAC-only patterns)
- Placeholder locations (N/A, TBD) pass through for AI to decide
- Jobs with a real, specific non-target location are dropped immediately (no description fallback)

## UI Architecture

Three fixed header bars in `App.tsx` (no flex-wrap):
- **Bar 1** (`#080b0f`): Logo, Search, Sort, Location filter, Source filter, Skills button
- **Bar 2** (`#090c10`): User, Sign Out, Pipeline, Settings, Gmail, Add Job, Select
- **Bar 3** (`#07080a`): Column counts + conversion rates (overflow-x-auto)

Job cards in `JobCard.tsx` are responsive with two-row footers:
- Row 1: posted date + applicants count
- Row 2: Resume / Prep / Email badges

## Settings Stored in DB

All pipeline configuration is stored per-user in InsForge (not in `.env`):
`SEARCH_KEYWORDS`, `TARGET_COUNTRIES`, `JOB_LEVELS`, `MAX_REQ_YOE`, `RELEVANCE_SCORE_THRESHOLD`, `TAILORING_INTENSITY`, `MAX_AGE_DAYS`, `MAX_JOBS_TEST_LIMIT`, `RESUME_ORDER`, `BATCH_DELAY_MS`, `APIFY_JOB_COUNT`, `LINKEDIN_SEARCH_URL`, `SCRAPE_*` toggles for all 15 scrapers.

## API URL Handling

- `VITE_API_URL` env var sets the API server origin for the client
- When empty (local dev with Vite proxy), relative URLs are used
- `authFetch()` in `api.ts` prepends `API_SERVER` to relative paths
- Resume/prep PDF view URLs always use `${API_SERVER}/api/...` to point to the Express server, not the Vite dev server
- `CareerEventsModal` `.ics` export URL also uses `API_SERVER`

## Deployment

- **Platform**: Railway (Railpack builder)
- **Build**: root `package.json` builds client (`cd client && npm run build`) then starts server
- **Static files**: Express serves `client/dist/` in production
- **Pipeline binary**: `tsx` binary location resolved from root, server, or pipeline `node_modules` (npm workspace hoisting)
- **PORT**: injected by Railway; server defaults to 3002 locally
