import { Router, Request, Response } from "express";
import { google } from "googleapis";
import crypto from "crypto";
import { getAllJobs, updateJob, upsertJob } from "../db-adapter";

const router = Router();

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

// ── Token Encryption (AES-256-GCM) ──────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const hex = process.env.GMAIL_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error("GMAIL_ENCRYPTION_KEY must be a 64-char hex string");
  return Buffer.from(hex, "hex");
}

function encrypt(text: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return { encrypted, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

function decrypt(encrypted: string, iv: string, tag: string): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ── DB Token Storage ────────────────────────────────────────────────────────

async function getStoredToken(client: any): Promise<{ refresh_token: string; gmail_email: string | null; last_sync_at: string | null } | null> {
  const { data } = await client.database.from("gmail_tokens").select().maybeSingle();
  if (!data) return null;
  const refresh_token = decrypt(data.encrypted_refresh_token, data.token_iv, data.token_tag);
  return { refresh_token, gmail_email: data.gmail_email, last_sync_at: data.last_sync_at };
}

async function saveToken(client: any, refreshToken: string, gmailEmail: string | null): Promise<void> {
  const { encrypted, iv, tag } = encrypt(refreshToken);
  const now = new Date().toISOString();

  // Check if row exists for this user (RLS scoped)
  const { data: existing } = await client.database.from("gmail_tokens").select("id").maybeSingle();
  if (existing) {
    await client.database.from("gmail_tokens").update({
      encrypted_refresh_token: encrypted,
      token_iv: iv,
      token_tag: tag,
      gmail_email: gmailEmail,
      updated_at: now,
    }).eq("id", existing.id);
  } else {
    await client.database.from("gmail_tokens").insert([{
      encrypted_refresh_token: encrypted,
      token_iv: iv,
      token_tag: tag,
      gmail_email: gmailEmail,
      updated_at: now,
    }]);
  }
}

async function updateLastSync(client: any): Promise<void> {
  const { data: existing } = await client.database.from("gmail_tokens").select("id").maybeSingle();
  if (existing) {
    await client.database.from("gmail_tokens").update({ last_sync_at: new Date().toISOString() }).eq("id", existing.id);
  }
}

async function deleteToken(client: any): Promise<void> {
  await client.database.from("gmail_tokens").delete().neq("id", 0); // delete all user rows (RLS scoped)
}

// ── OAuth Helpers ───────────────────────────────────────────────────────────

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || "http://localhost:3002/api/gmail/callback"
  );
}

// GET /api/gmail/status
router.get("/status", async (req: Request, res: Response) => {
  try {
    const stored = await getStoredToken(req.insforgeClient);
    res.json({
      connected: !!stored,
      lastSync: stored?.last_sync_at || null,
      email: stored?.gmail_email || null,
    });
  } catch (err: any) {
    console.error("[Gmail status]", err.message);
    res.json({ connected: false, lastSync: null, email: null });
  }
});

// GET /api/gmail/auth — returns OAuth URL with state for CSRF protection
router.get("/auth", (req: Request, res: Response) => {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
    res.status(400).json({ error: "Gmail OAuth credentials not configured on the server" });
    return;
  }

  // Encode user token in state so callback can authenticate
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : (req.query.token as string || "");
  const state = Buffer.from(JSON.stringify({ token })).toString("base64url");

  const oAuth2Client = getOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state,
  });
  res.json({ url: authUrl });
});

// GET /api/gmail/callback — exchanges code for tokens, stores encrypted in DB
// This route is hit by Google's redirect — no Bearer token in headers,
// so we recover the user from the state parameter.
router.get("/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query;
  if (!code || typeof code !== "string") {
    res.status(400).send("Missing code");
    return;
  }

  // Recover user token from state
  let userToken = "";
  try {
    const parsed = JSON.parse(Buffer.from(state as string, "base64url").toString());
    userToken = parsed.token || "";
  } catch {
    res.status(400).send("Invalid state parameter");
    return;
  }

  if (!userToken) {
    res.status(401).send("Authentication required");
    return;
  }

  try {
    // Create authenticated client from recovered token
    const { createAuthenticatedClient } = require("../insforge-client");
    const client = createAuthenticatedClient(userToken);
    const { data: userData, error: userError } = await client.auth.getCurrentUser();
    if (userError || !userData?.user) {
      res.status(401).send("Invalid or expired session. Please try connecting Gmail again.");
      return;
    }

    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);

    if (!tokens.refresh_token) {
      res.status(400).send("No refresh token received. Please try again — make sure to grant access.");
      return;
    }

    // Get the user's Gmail email
    oAuth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const gmailEmail = profile.data.emailAddress || null;

    // Store encrypted token in DB
    await saveToken(client, tokens.refresh_token, gmailEmail);

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5174";
    res.send(`<html><body style='font-family:sans-serif;background:#07080a;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>
      <div style='text-align:center'>
        <h2 style='color:#34d399'>Gmail connected!</h2>
        <p>Connected as ${gmailEmail || "your account"}</p>
        <p style='color:#6b7280'>Redirecting back...</p>
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
    console.error("[Gmail OAuth]", err.message);
    res.status(500).send("OAuth failed. Please try again.");
  }
});

// POST /api/gmail/disconnect — revoke token and delete from DB
router.post("/disconnect", async (req: Request, res: Response) => {
  try {
    const stored = await getStoredToken(req.insforgeClient);
    if (stored) {
      // Revoke with Google
      try {
        const oAuth2Client = getOAuth2Client();
        oAuth2Client.setCredentials({ refresh_token: stored.refresh_token });
        await oAuth2Client.revokeToken(stored.refresh_token);
      } catch { /* best effort */ }
    }
    await deleteToken(req.insforgeClient);
    res.json({ disconnected: true });
  } catch (err: any) {
    console.error("[Gmail disconnect]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Email Parsing Helpers ───────────────────────────────────────────────────

type JobStatusUpdate = "applied" | "interviewing" | "offer" | "rejected";

interface EmailInfo {
  status: JobStatusUpdate | null;
  label: string;
  company: string | null;
  jobTitle: string | null;
  location: string | null;
  date: string;
}

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

function decodeBody(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch { return ""; }
}

function extractPlainText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBody(payload.body.data);
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
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

function extractCompanyFromSubject(subject: string): string | null {
  const s = subject.replace(/^[A-Z][a-z]+,\s+/, "").trim();
  const patterns = [
    /your application was sent to\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /application(?:\s+\w+)?\s+(?:was sent|submitted)\s+to\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /thank you for applying to\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /we received your application(?:\s+for\s+.+?)?\s+at\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /your application to\s+(.+?)\s+has been/i,
    /application submitted(?:\s+to)?\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /interview.{0,20}(?:from|with|at)\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /interview.{0,60}[-–]\s*(.+?)(?:\s*[-–|,!]|$)/i,
    /offer.{0,20}(?:from|at)\s+(.+?)(?:\s*[-–|,!]|$)/i,
    /(?:unfortunately|regret).{0,30}(?:from|at|with)\s+(.+?)(?:\s*[-–|,!]|$)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1].trim().replace(/[.!,]+$/, "");
  }
  return null;
}

function parseLinkedInApplicationBody(body: string, companyName: string): { jobTitle: string | null; location: string | null } {
  if (!body || !companyName) return { jobTitle: null, location: null };
  const lines = body.split(/\n|\r|\u00b7|•/).map((l) => l.replace(/<[^>]+>/g, "").trim()).filter((l) => l.length > 1 && l.length < 100);
  let jobTitle: string | null = null;
  let location: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const companyTokenList = companyName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const isCompanyLine = companyTokenList.some((t) => line.toLowerCase().includes(t));
    if (isCompanyLine) {
      if (i > 0 && !jobTitle) jobTitle = lines[i - 1] || null;
      const locMatch = line.match(/\b(On-site|Hybrid|Remote|Full.time|Part.time)\b/i)
        || line.match(/[,·]\s*([^,·]+(?:shire|land|burg|ford|wick|ley|ton|field|minster|city|Remote).*?)(?:[·,]|$)/i);
      if (locMatch) location = locMatch[1]?.trim() || null;
      continue;
    }
    if (!location && /(On-site|Hybrid|Remote|Full.time|Part.time)/i.test(line) && line.length < 60) {
      location = line;
    }
  }
  if (!jobTitle) {
    const m = body.match(/for\s+([A-Z][^.•·\n]{3,60}?)\s+(?:at|@)\s+/);
    if (m) jobTitle = m[1].trim();
  }
  return { jobTitle, location };
}

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
  if (/job alert|jobs you might|recommended jobs|people also viewed|new jobs for you|open roles|we thought you|jobs based on your profile|similar jobs/.test(text)) return true;
  if (isFromPlatform(from) && /"[^"]+"\s*:/.test(subject)) return true;
  return false;
}

function classifyEmail(subject: string, snippet: string, body: string): EmailInfo {
  const text = (subject + " " + snippet + " " + body.slice(0, 800)).toLowerCase();
  const today = new Date().toISOString().split("T")[0];
  const company = extractCompanyFromSubject(subject);

  // ── Applied (check FIRST — confirmation emails often contain vague "next steps" language)
  if (/thank you for apply|application (was sent|has been sent|submitted|received|is under review)|your application to .+ (has been|was)|we.?ve received your application|successfully applied|easy apply|application has been received|we will review/.test(text)) {
    return { status: "applied", label: "Application confirmed", company, jobTitle: null, location: null, date: today };
  }
  // ── Offer
  if (/offer letter|job offer|formal offer|pleased to offer|we.?d like to offer|extend.{0,10}offer|congratulations.{0,30}offer|welcome.{0,20}(team|aboard)|start date|onboarding details|joining date/.test(text)) {
    return { status: "offer", label: "Job offer received", company, jobTitle: null, location: null, date: today };
  }
  // ── Interview (tightened: "next step" alone is too broad — require scheduling/action context)
  if (/\binterview\b|schedule.{0,20}(call|meeting|interview)|calendar invite|video call|phone screen|meet with you|hiring manager|technical assessment|coding (challenge|test)|take.home|online assessment|hackerrank|codility|testgorilla|move.{0,10}forward.{0,20}(with you|to the next)|invited.{0,15}next.{0,5}(step|round|stage)|your availability.{0,30}(schedule|call|meeting|interview)|discuss.{0,15}next steps|selected for the interview|excited to move forward|congratulations on being selected|blocks of time.{0,30}available/.test(text)) {
    return { status: "interviewing", label: "Interview / next step", company, jobTitle: null, location: null, date: today };
  }
  // ── Rejection
  if (/unfortunately|not moving forward|not selected|other candidates|regret to inform|decided not to (proceed|move)|position.{0,20}filled|wish you.{0,30}(best|luck|success)|after.{0,40}(consideration|review).{0,20}not|not be pursuing|unsuccessful/.test(text)) {
    return { status: "rejected", label: "Application rejected", company, jobTitle: null, location: null, date: today };
  }

  return { status: null, label: "", company, jobTitle: null, location: null, date: today };
}

// ── POST /api/gmail/sync ─────────────────────────────────────────────────────

router.post("/sync", async (req: Request, res: Response) => {
  try {
    const stored = await getStoredToken(req.insforgeClient);
    if (!stored) {
      res.status(401).json({ error: "Gmail not connected. Connect your Gmail first." });
      return;
    }

    const oAuth2Client = getOAuth2Client();
    oAuth2Client.setCredentials({ refresh_token: stored.refresh_token });

    // Auto-refresh access token
    oAuth2Client.on("tokens", () => { /* access tokens are ephemeral, refresh token doesn't change */ });

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // How far back to scan
    let daysBack = 90;
    if (stored.last_sync_at) {
      const ms = Date.now() - new Date(stored.last_sync_at).getTime();
      daysBack = Math.max(1, Math.ceil(ms / 86400000) + 1);
    }

    const q = [
      `newer_than:${daysBack}d`,
      "(",
      // Subject-based matches
      'subject:"application was sent"',
      'OR subject:"application submitted"',
      'OR subject:"thank you for applying"',
      'OR subject:"thank you for your interest"',
      'OR subject:"thank you for the showing interest"',
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
      // Body-based matches (catch emails with generic subjects)
      'OR "not to move forward"',
      'OR "decided not to proceed"',
      'OR "other candidates"',
      'OR "position has been filled"',
      'OR "regret to inform"',
      'OR "wish you the best of luck"',
      'OR "not be pursuing"',
      'OR "pleased to offer"',
      'OR "extend an offer"',
      'OR "welcome to the team"',
      'OR "schedule an interview"',
      'OR "schedule a call"',
      'OR "schedule a meeting"',
      'OR "your availability"',
      'OR "move forward with your"',
      'OR "selected for the interview"',
      'OR "congratulations on being selected"',
      'OR "excited to move forward"',
      'OR "discuss next steps"',
      'OR "discuss the next steps"',
      'OR "next steps in our process"',
      'OR "blocks of time"',
      'OR "application has been received"',
      'OR "successfully applied"',
      ")",
      "-label:promotions -label:social -category:promotions",
    ].join(" ");

    const listRes = await gmail.users.messages.list({ userId: "me", q, maxResults: 200 });
    const messages = listRes.data.messages || [];

    const updates: Array<{ id: number | null; company: string; newStatus: string; label: string; subject: string; created?: boolean }> = [];

    const allJobs = await getAllJobs(undefined, req.insforgeClient);
    const rank: Record<string, number> = { filtered: 0, saved: 0, applied: 1, interviewing: 2, offer: 3, rejected: 4 };

    for (const msg of messages) {
      if (!msg.id) continue;
      try {
        const detail = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
        const headers = detail.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const from = headers.find((h) => h.name === "From")?.value || "";
        const dateHdr = headers.find((h) => h.name === "Date")?.value || "";
        const snippet = detail.data.snippet || "";
        const body = extractPlainText(detail.data.payload);

        if (isPromotional(subject, from, snippet)) continue;

        const info = classifyEmail(subject, snippet, body);
        if (!info.status) continue;

        const fromPlatform = isFromPlatform(from);

        let matchedJob: any | null = null;
        for (const job of allJobs) {
          let matched = false;
          // Try matching company from subject extraction
          if (info.company) matched = textMatchesCompany(info.company, job.company_name);
          // Try matching subject/snippet text against job company name
          if (!matched) matched = textMatchesCompany(subject + " " + snippet, job.company_name);
          // For direct company emails, also match From address
          if (!matched && !fromPlatform) matched = textMatchesCompany(from, job.company_name);
          if (!matched) continue;

          const newRank = rank[info.status] ?? 0;
          const curRank = rank[job.status] ?? 0;
          if (newRank <= curRank && info.status !== "rejected") continue;

          matchedJob = job;
          break;
        }

        if (matchedJob) {
          const fields: any = { status: info.status };
          if (info.status === "interviewing") fields.interview_date = info.date;
          if (info.status === "offer") fields.offer_date = info.date;

          await updateJob(matchedJob.id, fields, req.insforgeClient);

          // Auto-trigger interview prep when Gmail sync moves a job to interviewing
          if (info.status === "interviewing" && matchedJob.status !== "interviewing") {
            const { triggerPrepIfNew } = require("../services/prep-generator");
            triggerPrepIfNew(matchedJob.id, req.insforgeClient).catch((err: any) => {
              console.error(`[Gmail sync] Prep trigger failed: ${err.message}`);
            });
          }

          matchedJob.status = info.status;
          updates.push({ id: matchedJob.id, company: matchedJob.company_name, newStatus: info.status, label: info.label, subject });

        } else if (info.status === "applied" && info.company) {
          const alreadyCreated = allJobs.some((j) => textMatchesCompany(info.company!, j.company_name));
          if (alreadyCreated) continue;

          const parsed = parseLinkedInApplicationBody(body || snippet, info.company);
          const jobTitle = parsed.jobTitle || "Application";
          const location = parsed.location || null;

          let appliedDate = info.date;
          if (dateHdr) {
            try {
              const d = new Date(dateHdr);
              if (!isNaN(d.getTime())) appliedDate = d.toISOString().split("T")[0];
            } catch { }
          }

          const { job: newJob } = await upsertJob({
            job_title: jobTitle,
            company_name: info.company,
            location,
            status: "applied",
            applied_date: appliedDate,
            notes: "Auto-added by Gmail sync"
          }, req.insforgeClient, req.userId);

          if (newJob) {
            allJobs.push(newJob);
            updates.push({ id: newJob.id, company: info.company, newStatus: "applied", label: "New job auto-created", subject, created: true });
          }
        }
      } catch (msgErr: any) {
        console.error(`[Gmail sync] Error processing message ${msg.id}: ${msgErr.message}`);
      }
    }

    await updateLastSync(req.insforgeClient);

    res.json({ synced: updates.length, updates, scanned: messages.length });
  } catch (err: any) {
    console.error("[Gmail sync]", err.message);
    // If token is revoked or invalid, clean up
    if (err.message?.includes("invalid_grant") || err.message?.includes("Token has been expired or revoked")) {
      await deleteToken(req.insforgeClient).catch(() => {});
      res.status(401).json({ error: "Gmail access was revoked. Please reconnect your Gmail." });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
