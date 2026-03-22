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
