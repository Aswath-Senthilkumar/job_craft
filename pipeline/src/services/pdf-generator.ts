import { config } from "../config";
import { log } from "../logger";
import { ResumeData } from "../types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pings the PDF backend repeatedly until it responds (handles cold-start sleep).
 * Render free-tier services sleep after inactivity and take ~2 min to wake up.
 */
export async function warmUpPdfBackend(): Promise<void> {
  const maxWaitMs = 150_000; // 2.5 minutes total
  const pingInterval = 10_000; // ping every 10s
  const deadline = Date.now() + maxWaitMs;

  log.step("Warming up PDF backend (may take up to 2 min on cold start)...");

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(config.PDF_BACKEND_URL.replace(/\/v1\/.*$/, "/health").replace(/\/get-resume.*$/, "/health"), {
        method: "GET",
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeoutId);
      if (res && (res.ok || res.status < 500)) {
        log.success("PDF backend is awake");
        return;
      }
    } catch {
      // still waking up
    }
    log.info("PDF backend not ready yet, waiting 10s...");
    await delay(pingInterval);
  }

  log.warn("PDF backend warm-up timed out — will still attempt generation");
}

/**
 * Recursively strip/replace characters that break the LaTeX backend's
 * buggy escape() function. The backend handles &, %, $ correctly but
 * has double-backslash bugs for #, _, {, }. We strip those here so
 * they never reach the backend's escape logic.
 */
function sanitizeForLatex(obj: any): any {
  if (typeof obj === "string") {
    return obj
      .replace(/#/g, "")          // # breaks LaTeX (macro parameter char)
      .replace(/\u2014/g, " -- ") // em dash → LaTeX-safe
      .replace(/\u2013/g, " -- ") // en dash → LaTeX-safe
      .replace(/\u2018/g, "'")    // smart quotes
      .replace(/\u2019/g, "'")
      .replace(/\u201C/g, "\"")
      .replace(/\u201D/g, "\"");
  }
  if (Array.isArray(obj)) return obj.map(sanitizeForLatex);
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = sanitizeForLatex(v);
    return out;
  }
  return obj;
}

export async function generatePdf(resumeData: ResumeData): Promise<Buffer> {
  const maxRetries = 3;
  const retryDelay = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 150_000); // 150s — covers cold start

      const sanitized = sanitizeForLatex(resumeData);
      const response = await fetch(config.PDF_BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitized),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const statusCode = response.status;
        // Retry on 5xx server errors, fail fast on 4xx client errors
        if (statusCode >= 500 && attempt < maxRetries) {
          throw new Error(`PDF backend server error: ${statusCode} ${response.statusText}`);
        }
        throw new Error(`PDF backend error: ${statusCode} ${response.statusText}`);
      }

      // Validate that response is actually a PDF
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/pdf") && !contentType.includes("application/octet-stream")) {
        throw new Error(
          `PDF backend returned unexpected content-type: "${contentType}" (expected application/pdf). ` +
          `The response may be an error page, not a PDF.`
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Sanity check: PDF files start with %PDF
      if (buffer.length < 5 || buffer.toString("ascii", 0, 4) !== "%PDF") {
        throw new Error("PDF backend returned data that is not a valid PDF (missing %PDF header)");
      }

      return buffer;
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw new Error(`PDF generation failed after ${maxRetries} attempts: ${error.message}`);
      }
      // Exponential backoff: 30s, 60s (long enough to handle cold-start between retries)
      await delay(retryDelay * attempt * 6);
    }
  }

  throw new Error("PDF generation failed after all retries");
}
