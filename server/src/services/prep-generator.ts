import crypto from "crypto";
import { google } from "googleapis";
import { researchCompany } from "./tinyfish-research";
import { generateIntelReport, generatePrepGuide } from "./claude-synthesis";
import {
  getJobById,
  selectPoolItems,
  uploadResume,
  getInterviewPrep,
  upsertInterviewPrep,
  updateInterviewPrep,
} from "../db-adapter";

// ── Gmail email context fetching ───────────────────────────────────────────────
// (Inline minimal implementation to avoid importing from route files)

function decryptToken(encrypted: string, iv: string, tag: string): string {
  const key = Buffer.from(process.env.GMAIL_ENCRYPTION_KEY || "", "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

async function fetchCompanyEmails(client: any, companyName: string): Promise<any | null> {
  try {
    const { data: tokenRow } = await client.database.from("gmail_tokens").select().maybeSingle();
    if (!tokenRow) return null;

    const refreshToken = decryptToken(
      tokenRow.encrypted_refresh_token,
      tokenRow.token_iv,
      tokenRow.token_tag,
    );

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI || "http://localhost:3002/api/gmail/callback",
    );
    oAuth2Client.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    const firstWord = companyName.split(/[\s,.(]/)[0].toLowerCase();
    const q = `(from:${firstWord} OR subject:"${companyName}") newer_than:30d`;
    const listRes = await gmail.users.messages.list({ userId: "me", q, maxResults: 10 });
    const messages = listRes.data.messages || [];
    if (messages.length === 0) return null;

    const threads: { subject: string; snippet: string; date: string }[] = [];
    for (const msg of messages.slice(0, 5)) {
      if (!msg.id) continue;
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });
      const headers = detail.data.payload?.headers || [];
      threads.push({
        subject: headers.find((h: any) => h.name === "Subject")?.value || "",
        snippet: detail.data.snippet || "",
        date: headers.find((h: any) => h.name === "Date")?.value || "",
      });
    }

    return threads.length > 0 ? { threads, threadCount: threads.length } : null;
  } catch (err: any) {
    console.warn(`[PrepGen] Gmail context fetch failed: ${err.message}`);
    return null;
  }
}

// ── PDF generation ─────────────────────────────────────────────────────────────

async function markdownToPdfBuffer(markdown: string): Promise<Buffer> {
  // Dynamic import to avoid startup cost
  const { mdToPdf } = await import("md-to-pdf");
  const pdf = await mdToPdf(
    { content: markdown },
    {
      pdf_options: {
        format: "A4",
        margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
        printBackground: true,
      },
      css: `
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif; line-height: 1.65; color: #1a1a1a; font-size: 13px; }
        h1 { font-size: 1.5em; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; color: #1e1b4b; margin-bottom: 0.3em; }
        h2 { font-size: 1.15em; color: #312e81; margin-top: 1.5em; border-left: 3px solid #4f46e5; padding-left: 8px; }
        h3 { font-size: 1em; color: #4338ca; margin-top: 1em; }
        table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 12px; }
        th { background: #4f46e5; color: white; padding: 7px 10px; text-align: left; }
        td { border: 1px solid #e5e7eb; padding: 6px 10px; }
        tr:nth-child(even) td { background: #f9fafb; }
        code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 0.85em; }
        blockquote { border-left: 3px solid #4f46e5; margin: 0.5em 0; padding: 0.5em 1em; color: #6b7280; background: #f8f9ff; }
        ul, ol { padding-left: 1.5em; }
        li { margin-bottom: 0.25em; }
        hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
        strong { color: #111; }
      `,
    },
  );
  if (!pdf.content) throw new Error("PDF generation produced empty output");
  return pdf.content;
}

// ── Main generation ────────────────────────────────────────────────────────────

export async function generateInterviewPrep(jobId: number, client: any, prepId: number): Promise<void> {
  try {
    // Step 1: Gather context
    const job = await getJobById(jobId, client);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const parse = (s: string | null) => { try { return JSON.parse(s || "[]"); } catch { return []; } };
    const jdKeywords: string[] = parse(job.jd_keywords);
    const matchedKeywords: string[] = parse(job.matched_keywords);
    const missingKeywords: string[] = parse(job.missing_keywords);

    const [poolSelection, emailContext] = await Promise.all([
      selectPoolItems(jdKeywords, 4, 3, client),
      fetchCompanyEmails(client, job.company_name),
    ]);

    // Step 2: Web research (Tinyfish) — cache results immediately
    const webResearch = await researchCompany(job.company_name, job.job_title, job.location, job.company_url);
    await updateInterviewPrep(prepId, {
      web_research: webResearch,
      email_context: emailContext,
    }, client);

    // Step 3: AI synthesis (Claude) — both docs in parallel
    const [intelMarkdown, prepMarkdown] = await Promise.all([
      generateIntelReport(job.company_name, job.job_title, webResearch, emailContext),
      generatePrepGuide(
        job.company_name,
        job.job_title,
        job.seniority_level,
        job.description,
        jdKeywords,
        matchedKeywords,
        missingKeywords,
        poolSelection,
        webResearch,
        emailContext,
      ),
    ]);

    // Step 4: PDF generation
    const companyClean = job.company_name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/, "");
    let intelReportUrl = "";
    let prepGuideUrl = "";

    try {
      const [intelPdf, prepPdf] = await Promise.all([
        markdownToPdfBuffer(intelMarkdown),
        markdownToPdfBuffer(prepMarkdown),
      ]);

      // Step 5: Upload both PDFs to InsForge storage
      [intelReportUrl, prepGuideUrl] = await Promise.all([
        uploadResume(`interview-prep-${companyClean}-intel-report.pdf`, intelPdf, client),
        uploadResume(`interview-prep-${companyClean}-prep-guide.pdf`, prepPdf, client),
      ]);

      await updateInterviewPrep(prepId, {
        intel_report_url: intelReportUrl,
        prep_guide_url: prepGuideUrl,
        status: "completed",
      }, client);
    } catch (pdfErr: any) {
      // PDF failed — store markdown inline as fallback, still mark completed
      console.warn(`[PrepGen] PDF generation/upload failed: ${pdfErr.message} — storing markdown inline`);
      await updateInterviewPrep(prepId, {
        web_research: {
          ...(webResearch || {}),
          _intel_markdown: intelMarkdown,
          _prep_markdown: prepMarkdown,
          _pdf_error: pdfErr.message,
        },
        email_context: emailContext,
        status: "completed",
      }, client);
    }

    console.log(`[PrepGen] Completed: ${job.job_title} at ${job.company_name} (job ${jobId})`);
  } catch (err: any) {
    console.error(`[PrepGen] Failed for job ${jobId}: ${err.message}`);
    await updateInterviewPrep(prepId, {
      status: "failed",
      error_message: err.message,
    }, client).catch(() => {});
  }
}

// ── Auto-trigger helper (called from jobs.ts and gmail.ts) ─────────────────────

export async function triggerPrepIfNew(jobId: number | string, client: any): Promise<void> {
  try {
    const id = Number(jobId);
    const existing = await getInterviewPrep(id, client);

    // Already in progress or successfully completed — don't re-trigger
    if (existing && (existing.status === "generating" || existing.status === "completed")) return;

    const { data: user } = await client.auth.getCurrentUser();
    const userId = user?.user?.id;

    let prepId: number;
    if (existing) {
      // Reset a failed prep
      await updateInterviewPrep(existing.id, { status: "generating", error_message: null }, client);
      prepId = existing.id;
    } else {
      const row = await upsertInterviewPrep(id, { status: "generating" }, client, userId);
      prepId = row.id;
    }

    // Fire and forget
    generateInterviewPrep(id, client, prepId).catch((err) => {
      console.error(`[PrepGen] Background error for job ${id}: ${err.message}`);
    });
  } catch (err: any) {
    console.error(`[PrepGen] triggerPrepIfNew failed: ${err.message}`);
  }
}
