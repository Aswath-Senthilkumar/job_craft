import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { ResumeData, EnhancedBulletResult } from "../types";
import { PoolSelection } from "../types";
import { RESUME_SYSTEM_PROMPT, buildResumeUserPrompt, buildBulletEnhancementPrompt } from "../prompts/resume";
import { log } from "../logger";

const MODEL_NAME = "claude-haiku-4-5-20251001";

let anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

function cleanJsonResponse(text: string): string {
  return text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .replace(/,(\s*[}\]])/g, "$1")
    .trim();
}

export async function customizeResume(
  resumeText: string,
  jobDescription: string,
  resumeKeywords: string[] = [],
  jdKeywords: string[] = []
): Promise<ResumeData> {
  const client = getClient();
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const message = await client.messages.create({
        model: MODEL_NAME,
        max_tokens: 8192,
        temperature: 0.4,
        system: RESUME_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildResumeUserPrompt(resumeText, jobDescription, config.TAILORING_INTENSITY, resumeKeywords, jdKeywords),
          },
        ],
      });

      const rawText = message.content[0].type === "text" ? message.content[0].text : "";
      const cleaned = cleanJsonResponse(rawText);

      if (!cleaned) {
        throw new Error("Claude returned empty response for resume customization");
      }

      const parsed = JSON.parse(cleaned);
      if (!parsed?.resumeData?.personalInfo) {
        throw new Error("Resume JSON missing required structure (resumeData.personalInfo)");
      }
      if (!parsed?.jd_analysis?.screened_skills) {
        throw new Error("Resume JSON missing required structure (jd_analysis)");
      }
      return parsed as ResumeData;
    } catch (err: any) {
      if (attempt < maxAttempts) {
        log.warn(`Resume customization attempt ${attempt} failed (${err.message}), retrying...`);
      } else {
        throw new Error(`Resume customization failed after ${maxAttempts} attempts: ${err.message}`);
      }
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error("Resume customization failed");
}

/**
 * Bullet-point-only enhancement: AI returns only improved bullets, summary, and skills.
 * The pipeline assembles the full ResumeData from the pool + these enhancements.
 */
export async function enhanceResumeBullets(
  pool: PoolSelection,
  jobDescription: string,
  resumeKeywords: string[] = [],
  jdKeywords: string[] = []
): Promise<EnhancedBulletResult> {
  const client = getClient();
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const message = await client.messages.create({
        model: MODEL_NAME,
        max_tokens: 4096,
        temperature: 0.4,
        system: RESUME_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildBulletEnhancementPrompt(pool, jobDescription, config.TAILORING_INTENSITY, resumeKeywords, jdKeywords),
          },
        ],
      });

      const rawText = message.content[0].type === "text" ? message.content[0].text : "";
      const cleaned = cleanJsonResponse(rawText);

      if (!cleaned) throw new Error("Claude returned empty response");

      const parsed = JSON.parse(cleaned);
      if (!parsed?.jd_analysis?.screened_skills) {
        throw new Error("Response missing jd_analysis");
      }
      if (!parsed?.experience || !parsed?.projects) {
        throw new Error("Response missing experience or projects arrays");
      }
      if (!parsed?.summary) {
        throw new Error("Response missing summary");
      }
      return parsed as EnhancedBulletResult;
    } catch (err: any) {
      if (attempt < maxAttempts) {
        log.warn(`Bullet enhancement attempt ${attempt} failed (${err.message}), retrying...`);
      } else {
        throw new Error(`Bullet enhancement failed after ${maxAttempts} attempts: ${err.message}`);
      }
    }
  }

  throw new Error("Bullet enhancement failed");
}
