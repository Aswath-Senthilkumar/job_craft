import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { ResumeData, PoolSelection } from "../types";
import { RESUME_SYSTEM_PROMPT, buildTailoredResumePrompt } from "../prompts/resume";
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

/**
 * High-level function to get a fully tailored resume object from Claude.
 */
export async function customizeResume(
  pool: PoolSelection,
  jobDescription: string,
): Promise<{ resumeData: ResumeData; jd_analysis: any }> {
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
            content: buildTailoredResumePrompt(pool, jobDescription, config.TAILORING_INTENSITY),
          },
        ],
      });

      const rawText = message.content[0].type === "text" ? message.content[0].text : "";
      const cleaned = cleanJsonResponse(rawText);

      if (!cleaned) {
        throw new Error("Claude returned empty response");
      }

      const parsed = JSON.parse(cleaned);
      if (!parsed?.resumeData || !parsed?.jd_analysis) {
        throw new Error("Response missing required resumeData or jd_analysis fields");
      }
      
      return parsed;
    } catch (err: any) {
      if (attempt < maxAttempts) {
        log.warn(`AI tailoring attempt ${attempt} failed (${err.message}), retrying...`);
      } else {
        throw new Error(`AI tailoring failed after ${maxAttempts} attempts: ${err.message}`);
      }
    }
  }

  throw new Error("AI tailoring failed");
}

