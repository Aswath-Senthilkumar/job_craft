# Future Enhancements

## ReWrite: Interactive Resume Refinement

Allow users to review and selectively accept/reject AI-suggested bullet point improvements after the pipeline generates a tailored resume.

**Flow:**
1. User opens a job's resume in the dashboard
2. Server reads stored `resume_data` (original vs improved bullet pairs) from the DB
3. UI displays side-by-side comparison with per-bullet accept/reject toggles
4. On "Apply", server swaps accepted bullets into the resume JSON and regenerates the PDF via `PDF_BACKEND_URL`

**What's already in place:**
- `resume_data` column exists in the jobs table (stores full resume JSON with original/improved pairs)
- Pipeline already sends `resume_data` to the server when attaching job assets
- Client component `ResumeCompareModal.tsx` exists with the UI (needs endpoint reconnection)
- Client API functions `analyzeResume()` and `applySuggestions()` exist in `api.ts`

**What needs to be built:**
- `server/src/routes/resume-analyze.ts` — two endpoints:
  - `POST /api/jobs/:id/analyze-resume` — read stored `resume_data` + keyword columns, return analysis
  - `POST /api/jobs/:id/apply-suggestions` — swap accepted bullets in JSON, call PDF backend, save new PDF
- Register the route in `server/src/index.ts`
- Add `PDF_BACKEND_URL` to `server/.env.example`

## Networking Outreach

For each job in the tracker, find potential contacts at the company and generate personalised outreach copy to improve response rates.

**Flow:**
1. User clicks "Find Contacts" on a job card (interviewing or applied status)
2. Server queries LinkedIn / Hunter.io / People Data Labs for employees at the company matching titles like "Engineering Manager", "Recruiter", "Tech Lead"
3. Claude generates outreach copy per contact:
   - LinkedIn connection note (300 char limit) — personalised to the contact's role and the job
   - Cold email — subject line + 3-paragraph body referencing the specific role
4. UI shows contacts list with copy-ready outreach snippets and one-click copy buttons

**What needs to be built:**
- Contact lookup service (`server/src/services/contact-finder.ts`) — wraps Hunter.io or PeopleDataLabs API
- Claude synthesis for outreach copy (`server/src/services/outreach-generator.ts`)
- Route `server/src/routes/outreach.ts` — `GET /api/jobs/:id/contacts`, `POST /api/jobs/:id/outreach`
- New DB table `outreach_contacts` — stores found contacts + generated copy per job
- Client component `OutreachModal.tsx` — contact list, outreach copy display, copy-to-clipboard

**Environment variables needed:**
```
HUNTER_API_KEY=      # or PEOPLE_DATA_LABS_API_KEY
```

## Career Events Search

Search for local career fairs, tech meetups, and networking events relevant to the user's location and job search.

**Flow:**
1. User opens the Events panel (button already exists in navbar, currently commented out)
2. Server queries Eventbrite API + Meetup.com for events matching the user's target location and job keywords
3. Results are cached in the existing `career_events` DB table (schema already in `server/src/db.ts`)
4. UI displays events in a list with date, location, type, and a direct link

**What needs to be built:**
- Event scraper service (`server/src/services/event-scraper.ts`) — Eventbrite API + Meetup.com RSS/API
- Populate the existing `server/src/routes/events.ts` route with real data (endpoint shell exists)
- Uncomment the Events button in `client/src/App.tsx` navbar
- Wire up the existing `CareerEventsModal.tsx` component to the live endpoint

**Environment variables needed:**
```
EVENTBRITE_API_KEY=   # Eventbrite private token
```

## Resume Manual Editor with Diff Tracking

**Problem:** The AI-tailored resume is generated and uploaded as a PDF, but users have no way to review the generated content, make manual edits, restructure bullet points, or adjust layout/alignment before the final PDF is produced.

**Proposed solution:** After the pipeline generates a tailored resume, surface an in-dashboard editor that shows the AI output with diff highlighting (original pool content vs. AI-enhanced version). Users can accept/reject individual changes, manually rewrite any section, reorder bullet points via drag-and-drop, and trigger a PDF regeneration from the edited content.

**Flow:**
1. User clicks a job card's resume badge → opens the Resume Editor modal
2. UI loads the stored `resume_data` JSON (original pool bullets + AI-enhanced bullets side by side)
3. Diff view highlights additions, removals, and rewrites per bullet with accept/reject toggles
4. Free-text editing allowed on any field — summary, bullets, skills, section order
5. Drag-and-drop reordering of bullet points within each experience/project block
6. "Regenerate PDF" button calls the PDF backend with the edited `resume_data` and replaces the stored PDF

**What needs to be built:**
- Resume editor modal (`client/src/components/ResumeEditorModal.tsx`) — diff view, inline editing, drag-and-drop bullets
- `POST /api/jobs/:id/save-resume` — persist manually edited `resume_data` back to the DB
- `POST /api/jobs/:id/regenerate-pdf` — call `PDF_BACKEND_URL` with edited data, upload new PDF, update `resume_url`
- Diff computation utility — compare original pool bullets vs. AI output at the sentence level
- Layout alignment controls — section spacing, bullet indent, font size hints passed to the PDF renderer

**Why deferred:**
- Requires a rich text / structured editor component with diff rendering — non-trivial UI work
- PDF renderer would need to accept fine-grained layout hints beyond the current resume JSON schema
- The `resume_data` column and pipeline attachment are already in place, so the data layer is ready

---

## Pipeline Job Queue Cache

**Problem:** Every pipeline run re-scrapes all sources from scratch. After skill scoring, a ranked `relevantQueue` is built — but only up to `MAX_JOBS_TEST_LIMIT` jobs get AI-tailored and posted. The remaining scored-but-unprocessed jobs are discarded, so the next run re-discovers and re-scores them unnecessarily.

**Proposed solution:** Persist the leftover queue to the DB after each run. On the next run, check the cache first — if enough leftover jobs remain, skip scraping entirely and process from the cache. If not enough remain, scrape only to fill the gap and merge with the cache.

**What needs to be built:**
- New DB table to store the pending queue (job data, score, matched/missing keywords, `scraped_at` timestamp)
- Freshness re-check on cache load — re-apply `MAX_AGE_DAYS` against the original `posted_at`
- DB dedup re-run on cached jobs — user may have manually added a cached job between runs
- Resume pool invalidation — if the pool changes between runs, cached scores are stale and need recomputing
- Pipeline startup pre-flight — check cache size vs. requested limit before deciding whether to scrape
- Partial scrape logic — "if leftover < limit, scrape for `limit − leftover` more and merge"

**Why deferred:**
- The DB dedup check (Step 7) already prevents re-processing seen jobs, so current scraping is not wasteful in terms of duplicate work — only in scraping time
- Most pipeline time is spent in AI tailoring (Steps 11–14), not scraping
- Jobs go stale quickly; a multi-day cache would have a high proportion of expired listings
- Adds meaningful DB schema work, cache invalidation logic, and branching across the pipeline
- Worth building when scraping becomes a bottleneck (rate limits, Apify costs, or slow scrape times)
