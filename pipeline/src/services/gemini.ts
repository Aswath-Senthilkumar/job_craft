import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { ResumeData, EnhancedBulletResult } from "../types";
import { PoolSelection } from "../types";
import { RESUME_SYSTEM_PROMPT, buildResumeUserPrompt, buildBulletEnhancementPrompt } from "../prompts/resume";
import { log } from "../logger";

const MODEL_NAME = "gemini-3.1-flash-lite-preview";

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  }
  return genAI;
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
  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: MODEL_NAME });
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const prompt = `${RESUME_SYSTEM_PROMPT}\n\n${buildResumeUserPrompt(resumeText, jobDescription, config.TAILORING_INTENSITY, resumeKeywords, jdKeywords)}`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      });

      const rawText = result.response.text() || "";
      const cleaned = cleanJsonResponse(rawText);

      if (!cleaned) {
        throw new Error("Gemini returned empty response for resume customization");
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
  const ai = getGenAI();
  const model = ai.getGenerativeModel({ model: MODEL_NAME });
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const prompt = `${RESUME_SYSTEM_PROMPT}\n\n${buildBulletEnhancementPrompt(pool, jobDescription, config.TAILORING_INTENSITY, resumeKeywords, jdKeywords)}`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      });

      const rawText = result.response.text() || "";
      const cleaned = cleanJsonResponse(rawText);

      if (!cleaned) throw new Error("Gemini returned empty response");

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
