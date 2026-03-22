import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { log } from "../logger";
import { politeGet } from "./scrapers/utils";

export interface ATSSlugs {
  ashby: string[];
  lever: string[];
  greenhouse: string[];
}

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic) anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  return anthropic;
}

/**
 * Ask Claude to discover company slugs for ATS platforms
 * based on the user's target roles and countries.
 */
async function askClaudeForSlugs(): Promise<ATSSlugs> {
  const client = getClient();
  const roles = config.SEARCH_KEYWORDS;
  const countries = config.TARGET_COUNTRIES;

  const prompt = `You are a job market expert. I need company URL slugs for three ATS platforms: Ashby, Lever, and Greenhouse.

Give me companies that:
1. Are actively hiring for roles related to: ${roles}
2. Have offices or remote positions in: ${countries}
3. Use these ATS platforms for their careers pages

For each platform, provide the URL slug used in their careers page:
- Ashby: the slug in jobs.ashbyhq.com/{slug}
- Lever: the slug in jobs.lever.co/{slug}
- Greenhouse: the board token in boards.greenhouse.io/{token}

Return ONLY valid JSON. No backticks, no markdown, no explanation:
{"ashby": ["slug1", "slug2", ...], "lever": ["slug1", "slug2", ...], "greenhouse": ["token1", "token2", ...]}

Aim for 15-25 companies per platform. Only include slugs you are confident are correct.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "";
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      ashby: Array.isArray(parsed.ashby) ? parsed.ashby.filter((s: any) => typeof s === "string") : [],
      lever: Array.isArray(parsed.lever) ? parsed.lever.filter((s: any) => typeof s === "string") : [],
      greenhouse: Array.isArray(parsed.greenhouse) ? parsed.greenhouse.filter((s: any) => typeof s === "string") : [],
    };
  } catch (err: any) {
    log.warn(`ATS discovery via Claude failed: ${err.message}`);
    return { ashby: [], lever: [], greenhouse: [] };
  }
}

/**
 * Validate slugs by making quick HEAD/GET requests.
 * Only keep slugs that return 200.
 */
async function validateSlugs(slugs: ATSSlugs): Promise<ATSSlugs> {
  async function checkUrl(url: string): Promise<boolean> {
    try {
      const res = await politeGet(url);
      return res.ok;
    } catch {
      return false;
    }
  }

  const [ashbyValid, leverValid, greenhouseValid] = await Promise.all([
    Promise.all(slugs.ashby.map(async (s) => ({
      slug: s,
      valid: await checkUrl(`https://api.ashbyhq.com/posting-api/job-board/${s}`),
    }))),
    Promise.all(slugs.lever.map(async (s) => ({
      slug: s,
      valid: await checkUrl(`https://api.lever.co/v0/postings/${s}?mode=json`),
    }))),
    Promise.all(slugs.greenhouse.map(async (s) => ({
      slug: s,
      valid: await checkUrl(`https://boards-api.greenhouse.io/v1/boards/${s}/jobs`),
    }))),
  ]);

  const result: ATSSlugs = {
    ashby: ashbyValid.filter((r) => r.valid).map((r) => r.slug),
    lever: leverValid.filter((r) => r.valid).map((r) => r.slug),
    greenhouse: greenhouseValid.filter((r) => r.valid).map((r) => r.slug),
  };

  const totalDiscovered = slugs.ashby.length + slugs.lever.length + slugs.greenhouse.length;
  const totalValid = result.ashby.length + result.lever.length + result.greenhouse.length;
  log.info(`  ATS discovery: ${totalValid}/${totalDiscovered} valid slugs (Ashby: ${result.ashby.length}, Lever: ${result.lever.length}, Greenhouse: ${result.greenhouse.length})`);

  return result;
}

/**
 * Discover ATS company slugs using Gemini, then validate them.
 */
export async function discoverATSSlugs(): Promise<ATSSlugs> {
  log.step("Discovering company ATS boards via Claude...");
  const raw = await askClaudeForSlugs();
  const validated = await validateSlugs(raw);
  return validated;
}
