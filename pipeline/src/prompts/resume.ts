import { PoolSelection } from "../types";

export const RESUME_SYSTEM_PROMPT = `You are a senior resume writer. Return ONLY valid JSON. No backticks. No markdown. Your entire response must begin with { and end with }.`;

/**
 * Builds the user prompt for Claude to return a complete ResumeData object.
 */
export function buildTailoredResumePrompt(
  pool: PoolSelection,
  jobDescription: string,
  tailoringIntensity: number = 5,
): string {
  const { profile, experiences, projects, education, skills: poolSkills } = pool;
  const poolJson = JSON.stringify({ profile, experiences, projects, education, skills: poolSkills }, null, 2);

  return `TAILORING INTENSITY: ${tailoringIntensity}/10
(1-3: Light polish only. 4-7: Surface and sharpen weak bullets. 8-10: Aggressive restructuring, push every bullet to the quality bar.)

---

RESUME POOL:
${poolJson}

JOB DESCRIPTION:
${jobDescription}

---

BULLET POINT QUALITY BAR:

A bullet is considered complete if it contains all three of:
1. Problem or context — what situation or gap existed
2. Action — what the candidate did to address it, with tools/methods named
3. Outcome — a concrete result, ideally with a metric

Use the tailoring intensity to calibrate how aggressively you apply this bar:
- At 1-3: Only fix obvious issues like passive voice or buried outcomes. Null most bullets.
- At 4-7: Surface missing elements where the original text implies them. Null if truly absent.
- At 8-10: Restructure any bullet that does not clearly hit all three. Still null if the information is not there.

---

RULES:

ENHANCEMENT:
- Improve only by restructuring or sharpening what is already stated
- Never add tools, metrics, or outcomes not present in the original text
- Never add keywords from the JD unless the candidate's own words already state them
- Fix passive voice, buried outcomes, or weak openings where present
- One bullet in, one bullet out — never split or merge

NULL:
- Return null if the bullet already meets the quality bar
- Return null if the missing element cannot be filled from the original text
- When in doubt, return null

LENGTH — HARD RULE:
- The improved version of a bullet must always be greater than or equal to the character length of the original
- Never produce an improved bullet that is shorter than its original
- If you cannot improve a bullet without making it shorter, return null
- Trimming, compressing, or condensing a bullet is never an improvement — it is a failure
- The only valid directions are: same length with better phrasing, or longer with surfaced context

FORBIDDEN — never use these words anywhere in output:
pivotal, crucial, groundbreaking, showcasing, fostering, dynamic, robust, synergy,
leveraged, spearheaded, driven, passionate, results-driven, proven track record,
seamlessly, impactful, transformative

EM DASHES:
- Never use em dashes (—) anywhere in the output
- Replace with a comma or period where needed

INTEGRITY:
- Do not change company names, job titles, dates, or locations
- Do not fabricate or infer any metric not explicitly stated in the pool
- Return every bullet — do not drop or reorder any point

SUMMARY:
- Write 2-3 sentences using only information present in the pool
- Match the seniority tone of the JD
- No adjectives unless backed by a concrete fact in the pool

SKILLS:
- Reorder categories to front-load what is most relevant to the JD
- Do not add any skill not present in the pool

---

OUTPUT FORMAT:

Return ONLY valid JSON. No backticks. No markdown. Start with { and end with }.

{
  "jd_analysis": {
    "domain": "string",
    "seniority": "string",
    "screened_skills": ["string"],
    "seniority_signals": ["string"]
  },
  "resumeData": {
    "personalInfo": {
      "name": "string", "phone": "string", "email": "string",
      "linkedin": "string", "github": "string", "portfolio": "string"
    },
    "summary": "string",
    "education": [
      { "institution": "string", "date": "string", "degree": "string", "gpa": "string" }
    ],
    "skills": {
      "languages": "string", "frameworks": "string", "dataAndMiddleware": "string",
      "cloudAndDevops": "string", "testingAndTools": "string"
    },
    "experience": [
      {
        "title": "string", "company": "string", "date": "string", "location": "string",
        "summary": "max 6 words",
        "bulletPoints": [{ "original": "string", "improved": "string or null" }]
      }
    ],
    "projects": [
      {
        "title": "string", "link": "string", "date": "string", "location": "string",
        "summary": "max 6 words",
        "bulletPoints": [{ "original": "string", "improved": "string or null" }]
      }
    ],
    "certifications": [],
    "awards": []
  }
}`;
}

// Deprecated
export function buildResumeUserPrompt(...args: any[]): string { return "Deprecated."; }
export function buildBulletEnhancementPrompt(...args: any[]): string { return "Deprecated."; }
