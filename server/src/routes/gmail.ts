import { Router, Request, Response } from "express";
import { google } from "googleapis";
import path from "path";
import fs from "fs";
import db from "../db";

const router = Router();
const TOKEN_PATH = path.join(process.cwd(), "gmail-token.json");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || "http://localhost:3002/api/gmail/callback"
  );
}

// GET /api/gmail/status
router.get("/status", (_req: Request, res: Response) => {
  const connected = fs.existsSync(TOKEN_PATH);
  let lastSync: string | null = null;
  if (connected) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
      lastSync = data._lastSync || null;
    } catch (err: any) {
      console.error(`[Gmail] Failed to read token file: ${err.message}`);
    }
  }
  res.json({ connected, lastSync });
});

// GET /api/gmail/auth — returns OAuth URL
router.get("/auth", (_req: Request, res: Response) => {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
    res.status(400).json({ error: "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET not set in environment" });
    return;
  }
  const oAuth2Client = getOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  res.json({ url: authUrl });
});

// GET /api/gmail/callback — saves token after OAuth
router.get("/callback", async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    res.status(400).send("Missing code");
    return;
  }
  try {
    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
    const tokenData = { ...tokens, _lastSync: null };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData));
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5174";
    res.send(`<html><body style='font-family:sans-serif;background:#07080a;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>
      <div style='text-align:center'>
        <h2 style='color:#34d399'>Gmail connected!</h2>
        <p>Redirecting back to Job Tracker...</p>
        <script>
          try { if (window.opener) window.opener.postMessage('gmail_connected', '${clientUrl}'); } catch(e) {}
          setTimeout(() => {
            try { window.location.href = '${clientUrl}/?gmail=connected'; } catch(e) {}
            setTimeout(() => window.close(), 500);
          }, 800);
        </script>
      </div>
    </body></html>`);
  } catch (err: any) {
    console.error(`[Gmail OAuth] Error: ${err.message}`);
    res.status(500).send("OAuth failed. Please try again.");
  }
});

// POST /api/gmail/disconnect
router.post("/disconnect", (_req: Request, res: Response) => {
  try {
    if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
    res.json({ disconnected: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

type JobStatusUpdate = "applied" | "interviewing" | "offer" | "rejected";

interface EmailInfo {
  status: JobStatusUpdate | null;
  label: string;
  /** Company extracted from subject / body (for platform emails) */
  company: string | null;
  /** Job title extracted from body */
  jobTitle: string | null;
  /** Location extracted from body */
  location: string | null;
  date: string;
}

/** Known platform / ATS domains — company is NOT in the From address */
const PLATFORM_DOMAINS = [
  "linkedin.com", "greenhouse.io", "greenhouse-mail.io",
  "lever.co", "hire.lever.co", "workday.com", "myworkday.com",
  "smartrecruiters.com", "taleo.net", "ashbyhq.com", "teamtailor.com",
  "recruitee.com", "jobvite.com", "icims.com", "successfactors.com",
  "bamboohr.com", "workable.com", "breezy.hr", "applytojob.com",
];

function isFromPlatform(from: string): boolean {
  return PLATFORM_DOMAINS.some((d) => from.toLowerCase().includes(d));
}

/** Decode base64url to plain text */
function decodeBody(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch { return ""; }
}

/** Walk MIME parts and return the first text/plain or stripped text/html content */
function extractPlainText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBody(payload.body.data);
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    // Strip HTML tags
    return decodeBody(payload.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  return "";
}

/**
 * Extract company name from LinkedIn-style subject lines.
 *  "[Name], your application was sent to [Company]"
 *  "Your application was sent to [Company]"
 *  "Thank you for applying to [Company]"
 *  "We received your application at [Company]"
 */
function extractCompanyFromSubject(subject: string): string | null {
  // Strip leading name prefix like "Name, " before matching
  const s = subject.replace(/^[A-Z][a-z]+,\s+/, "").trim();

  const patterns = [
    /your application was sent to\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /application(?:\s+\w+)?\s+(?:was sent|submitted)\s+to\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /thank you for applying to\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /we received your application(?:\s+for\s+.+?)?\s+at\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /your application to\s+(.+?)\s+has been/i,
    /application submitted(?:\s+to)?\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /interview.{0,20}(?:from|with|at)\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /offer.{0,20}(?:from|at)\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /(?:unfortunately|regret).{0,30}(?:from|at|with)\s+(.+?)(?:\s*[-–|,!]|$)/i,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1].trim().replace(/[.!,]+$/, "");
  }
  return null;
}

/**
 * Parse LinkedIn application email body to extract job title and location.
 * Body typically contains lines like:
 *   "Job Title"
 *   "Company Name · Location (On-site)"
 *   "Applied on Date"
 */
function parseLinkedInApplicationBody(body: string, companyName: string): { jobTitle: string | null; location: string | null } {
  if (!body || !companyName) return { jobTitle: null, location: null };

  const lines = body.split(/\n|\r|\u00b7|•/).map((l) => l.replace(/<[^>]+>/g, "").trim()).filter((l) => l.length > 1 && l.length < 100);

  let jobTitle: string | null = null;
  let location: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Job title usually appears just before the company line
    const companyTokenList = companyName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const isCompanyLine = companyTokenList.some((t) => line.toLowerCase().includes(t));

    if (isCompanyLine) {
      // Job title is likely the previous non-empty line
      if (i > 0 && !jobTitle) jobTitle = lines[i - 1] || null;
      // Location may be on the same line (after the company token) or the next line
      const locMatch = line.match(/\b(On-site|Hybrid|Remote|Full.time|Part.time)\b/i)
        || line.match(/[,·]\s*([^,·]+(?:shire|land|burg|ford|wick|ley|ton|field|minster|city|Remote).*?)(?:[·,]|$)/i);
      if (locMatch) location = locMatch[1]?.trim() || null;
      continue;
    }

    // Dedicated location line
    if (!location && /(On-site|Hybrid|Remote|Full.time|Part.time)/i.test(line) && line.length < 60) {
      location = line;
    }
  }

  // Fallback: look for "for [Title] at [Company]" in full text
  if (!jobTitle) {
    const m = body.match(/for\s+([A-Z][^.•·\n]{3,60}?)\s+(?:at|@)\s+/);
    if (m) jobTitle = m[1].trim();
  }

  return { jobTitle, location };
}

/** Tokenise company name, strip legal suffixes */
function companyTokens(name: string): string[] {
  const stop = new Set(["llc", "ltd", "inc", "plc", "gmbh", "ag", "sa", "corp", "co", "the", "and", "of", "group", "services", "solutions", "technologies"]);
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
}

function textMatchesCompany(text: string, companyName: string): boolean {
  const tokens = companyTokens(companyName);
  if (tokens.length === 0) return false;
  const t = text.toLowerCase();
  return tokens.some((tok) => t.includes(tok));
}

function isPromotional(subject: string, from: string, snippet: string): boolean {
  const text = (subject + " " + snippet).toLowerCase();
  if (/unsubscribe|newsletter|marketing|promotional|digest|weekly round/.test(text)) return true;
  // LinkedIn job-suggestion alerts (NOT application responses)
  if (/job alert|jobs you might|recommended jobs|people also viewed|new jobs for you|open roles|we thought you|jobs based on your profile|similar jobs/.test(text)) return true;
  // If from is a platform domain AND looks like a bulk alert
  if (isFromPlatform(from) && /"[^"]+"\s*:/.test(subject)) return true; // LinkedIn job alerts: "Job Title": Company - ...
  return false;
}

function classifyEmail(subject: string, snippet: string, body: string): EmailInfo {
  // Combine subject + first 800 chars of body for classification
  const text = (subject + " " + snippet + " " + body.slice(0, 800)).toLowerCase();
  const today = new Date().toISOString().split("T")[0];
  const company = extractCompanyFromSubject(subject);

  // ── Offer ────────────────────────────────────────────────────────────────
  if (/offer letter|job offer|formal offer|pleased to offer|we.?d like to offer|extend.{0,10}offer|congratulations.{0,30}offer|welcome.{0,20}(team|aboard)|start date|onboarding details|joining date/.test(text)) {
    return { status: "offer", label: "Job offer received", company, jobTitle: null, location: null, date: today };
  }

  // ── Interview ────────────────────────────────────────────────────────────
  if (/\binterview\b|schedule.{0,20}(call|meeting|interview)|calendar invite|video call|phone screen|next step|meet with you|hiring manager|technical assessment|coding (challenge|test)|take.home|online assessment|hackerrank|codility|testgorilla/.test(text)) {
    return { status: "interviewing", label: "Interview / next step", company, jobTitle: null, location: null, date: today };
  }

  // ── Rejection ────────────────────────────────────────────────────────────
  if (/unfortunately|not moving forward|not selected|other candidates|regret to inform|decided not to (proceed|move)|position.{0,20}filled|wish you.{0,30}(best|luck|success)|after.{0,40}(consideration|review).{0,20}not|not be pursuing|unsuccessful/.test(text)) {
    return { status: "rejected", label: "Application rejected", company, jobTitle: null, location: null, date: today };
  }

  // ── Applied (confirmation) ───────────────────────────────────────────────
  if (/application (was sent|has been sent|submitted|received|is under review)|your application to .+ (has been|was)|thank you for apply|we.?ve received your application|successfully applied|easy apply/.test(text)) {
    return { status: "applied", label: "Application confirmed", company, jobTitle: null, location: null, date: today };
  }

  return { status: null, label: "", company, jobTitle: null, location: null, date: today };
}

// ── POST /api/gmail/sync ─────────────────────────────────────────────────────
router.post("/sync", async (_req: Request, res: Response) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    res.status(401).json({ error: "Gmail not connected. Visit /api/gmail/auth first." });
    return;
  }

  try {
    const oAuth2Client = getOAuth2Client();
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    oAuth2Client.setCredentials(tokenData);

    oAuth2Client.on("tokens", (tokens) => {
      if (tokens.refresh_token) tokenData.refresh_token = tokens.refresh_token;
      Object.assign(tokenData, tokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData));
    });

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // How far back to scan
    let daysBack = 90;
    if (tokenData._lastSync) {
      const ms = Date.now() - new Date(tokenData._lastSync).getTime();
      daysBack = Math.max(1, Math.ceil(ms / 86400000) + 1);
    }

    const q = [
      `newer_than:${daysBack}d`,
      "(",
      'subject:"application was sent"',
      'OR subject:"application submitted"',
      'OR subject:"thank you for applying"',
      'OR subject:"we received your application"',
      'OR subject:"your application"',
      'OR subject:interview',
      'OR subject:"offer letter"',
      'OR subject:"job offer"',
      'OR subject:"next steps"',
      'OR subject:unfortunately',
      'OR subject:"not moving forward"',
      'OR subject:congratulations',
      'OR subject:assessment',
      'OR subject:"phone screen"',
      'OR subject:"video interview"',
      'OR subject:"easy apply"',
      ")",
      "-label:promotions -label:social -category:promotions",
    ].join(" ");

    const listRes = await gmail.users.messages.list({ userId: "me", q, maxResults: 200 });
    const messages = listRes.data.messages || [];

    const updates: Array<{ id: number | null; company: string; newStatus: string; label: string; subject: string; created?: boolean }> = [];

    // Load all jobs (including already-applied / rejected — to avoid re-creating)
    const allJobs = db.prepare("SELECT id, company_name, job_link, status FROM jobs").all() as Array<{
      id: number; company_name: string; job_link: string | null; status: string;
    }>;

    const rank: Record<string, number> = { filtered: 0, saved: 0, applied: 1, interviewing: 2, offer: 3, rejected: 4 };

    for (const msg of messages) {
      if (!msg.id) continue;
      try {
        // Fetch full message so we can parse the body for job title / location
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const headers = detail.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const from    = headers.find((h) => h.name === "From")?.value || "";
        const dateHdr = headers.find((h) => h.name === "Date")?.value || "";
        const snippet = detail.data.snippet || "";
        const body    = extractPlainText(detail.data.payload);

        if (isPromotional(subject, from, snippet)) continue;

        const info = classifyEmail(subject, snippet, body);
        if (!info.status) continue;

        const fromPlatform = isFromPlatform(from);

        // ── Match against existing jobs ──────────────────────────────────────
        let matchedJob: typeof allJobs[0] | null = null;

        for (const job of allJobs) {
          let matched = false;
          if (fromPlatform) {
            // Platform email: match extracted company against DB company name
            if (info.company) matched = textMatchesCompany(info.company, job.company_name);
            if (!matched)     matched = textMatchesCompany(subject + " " + snippet, job.company_name);
          } else {
            // Direct company email: match From address against DB company name
            matched = textMatchesCompany(from, job.company_name);
          }
          if (!matched) continue;

          // Forward-only transition
          const newRank = rank[info.status] ?? 0;
          const curRank = rank[job.status] ?? 0;
          if (newRank <= curRank && info.status !== "rejected") continue;

          matchedJob = job;
          break;
        }

        if (matchedJob) {
          // Update existing job
          const dateField = info.status === "interviewing" ? "interview_date"
                          : info.status === "offer"        ? "offer_date"
                          : null;
          if (dateField) {
            db.prepare(`UPDATE jobs SET status = ?, ${dateField} = COALESCE(${dateField}, ?), updated_at = datetime('now') WHERE id = ?`)
              .run(info.status, info.date, matchedJob.id);
          } else {
            db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?")
              .run(info.status, matchedJob.id);
          }
          matchedJob.status = info.status; // prevent double-update in same sync
          updates.push({ id: matchedJob.id, company: matchedJob.company_name, newStatus: info.status, label: info.label, subject });

        } else if (info.status === "applied" && info.company) {
          // ── No existing job found → auto-create from LinkedIn confirmation ──
          // Avoid creating duplicates if we already created one in this sync run
          const alreadyCreated = allJobs.some((j) => textMatchesCompany(info.company!, j.company_name));
          if (alreadyCreated) continue;

          // Parse job title + location from full email body
          const parsed = parseLinkedInApplicationBody(body || snippet, info.company);
          const jobTitle = parsed.jobTitle || "Application";
          const location = parsed.location || null;

          // Parse email date (e.g. "Fri, 14 Mar 2026 22:47:00 +0000")
          let appliedDate = info.date;
          if (dateHdr) {
            try {
              const d = new Date(dateHdr);
              if (!isNaN(d.getTime())) appliedDate = d.toISOString().split("T")[0];
            } catch { /* invalid date header — use default */ }
          }

          const result = db.prepare(
            `INSERT INTO jobs (job_title, company_name, location, status, applied_date, notes, created_at, updated_at)
             VALUES (?, ?, ?, 'applied', ?, ?, datetime('now'), datetime('now'))`
          ).run(
            jobTitle,
            info.company,
            location,
            appliedDate,
            "Auto-added by Gmail sync (LinkedIn Easy Apply)"
          );

          const newId = result.lastInsertRowid as number;
          // Add to in-memory list to prevent duplicates within same sync
          allJobs.push({ id: newId, company_name: info.company, job_link: null, status: "applied" });
          updates.push({ id: newId, company: info.company, newStatus: "applied", label: "New job auto-created", subject, created: true });
        }
      } catch (msgErr: any) {
        console.error(`[Gmail sync] Error processing message ${msg.id}: ${msgErr.message}`);
      }
    }

    tokenData._lastSync = new Date().toISOString();
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData));

    res.json({ synced: updates.length, updates, scanned: messages.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
