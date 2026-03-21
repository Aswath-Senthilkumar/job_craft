import { Job } from "../types";

/**
 * Canonical seniority levels ordered from lowest to highest.
 * Each maps to a set of aliases found in job titles.
 */
const LEVEL_ALIASES: Record<string, string[]> = {
  intern:    ["intern", "internship"],
  junior:    ["junior", "jr", "entry level", "entry-level", "new grad", "graduate", "grad"],
  associate: ["associate"],
  mid:       ["mid", "mid-level", "mid level", "sde 1", "sde i", "sde1", "swe 1", "swe i", "l3", "ic3"],
  sde2:      ["sde 2", "sde ii", "sde2", "swe 2", "swe ii", "l4", "ic4"],
  senior:    ["senior", "sr", "sde 3", "sde iii", "sde3", "swe 3", "swe iii", "l5", "ic5"],
  staff:     ["staff", "sde 4", "sde iv", "l6", "ic6"],
  principal: ["principal", "distinguished", "fellow", "l7", "ic7"],
  lead:      ["lead", "team lead", "tech lead", "engineering lead"],
  manager:   ["manager", "engineering manager", "em"],
  director:  ["director"],
  vp:        ["vp", "vice president"],
};

/** Map user-facing JOB_LEVELS values to canonical keys */
const INPUT_TO_CANONICAL: Record<string, string> = {
  "intern":       "intern",
  "internship":   "intern",
  "junior":       "junior",
  "jr":           "junior",
  "entry level":  "junior",
  "entry-level":  "junior",
  "new grad":     "junior",
  "graduate":     "junior",
  "associate":    "associate",
  "mid":          "mid",
  "mid-level":    "mid",
  "sde 1":        "mid",
  "sde i":        "mid",
  "sde1":         "mid",
  "sde 2":        "sde2",
  "sde ii":       "sde2",
  "sde2":         "sde2",
  "senior":       "senior",
  "sr":           "senior",
  "sde 3":        "senior",
  "sde iii":      "senior",
  "sde3":         "senior",
  "staff":        "staff",
  "principal":    "principal",
  "lead":         "lead",
  "manager":      "manager",
  "director":     "director",
  "vp":           "vp",
};

/**
 * Detect the seniority level from a job title.
 * Returns a canonical level key, or "mid" if no seniority qualifier is found
 * (a plain "Software Developer" is treated as mid/SDE 1 level).
 */
export function detectSeniority(title: string): string {
  const t = title.toLowerCase().trim();

  // Check longest aliases first to avoid partial matches (e.g. "entry level" before "entry")
  const allAliases: { alias: string; level: string }[] = [];
  for (const [level, aliases] of Object.entries(LEVEL_ALIASES)) {
    for (const alias of aliases) {
      allAliases.push({ alias, level });
    }
  }
  allAliases.sort((a, b) => b.alias.length - a.alias.length);

  for (const { alias, level } of allAliases) {
    // Word-boundary match
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(t)) {
      return level;
    }
  }

  // No seniority qualifier found → default to "mid"
  return "mid";
}

/**
 * Parse required years of experience from a job description.
 * Returns the minimum required YOE, or 0 if none found.
 */
export function parseRequiredYOE(description: string): number {
  if (!description) return 0;

  const patterns = [
    // "5+ years", "5+ yrs"
    /(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)/gi,
    // "minimum 5 years", "at least 5 years", "requires 5 years"
    /(?:minimum|at\s+least|requires?|must\s+have)\s+(\d+)\s*\+?\s*(?:years?|yrs?)/gi,
    // "5-7 years of experience"
    /(\d+)\s*[-–]\s*\d+\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)/gi,
    // "experience: 5 years"
    /experience\s*:\s*(\d+)\s*\+?\s*(?:years?|yrs?)/gi,
  ];

  let maxFound = 0;
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      const yoe = parseInt(match[1], 10);
      if (!isNaN(yoe) && yoe > maxFound) {
        maxFound = yoe;
      }
    }
  }

  return maxFound;
}

/**
 * Parse user's JOB_LEVELS env var into a set of canonical level keys.
 */
export function parseJobLevels(jobLevelsStr: string): Set<string> {
  if (!jobLevelsStr.trim()) return new Set();

  const levels = new Set<string>();
  const parts = jobLevelsStr.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  for (const part of parts) {
    const canonical = INPUT_TO_CANONICAL[part];
    if (canonical) {
      levels.add(canonical);
    } else {
      // Try fuzzy: check if any alias contains the input
      for (const [level, aliases] of Object.entries(LEVEL_ALIASES)) {
        if (aliases.some(a => a === part || part === level)) {
          levels.add(level);
          break;
        }
      }
    }
  }

  return levels;
}

/**
 * Filter jobs by seniority level and max YOE requirement.
 * Returns { accepted, rejected } with rejection reasons.
 */
export function filterBySeniority(
  jobs: Job[],
  jobLevelsStr: string,
  maxReqYOE: number,
): { accepted: Job[]; rejectedCount: number; levelRejected: number; yoeRejected: number } {
  const acceptedLevels = parseJobLevels(jobLevelsStr);
  const checkLevels = acceptedLevels.size > 0;
  const checkYOE = maxReqYOE > 0;

  if (!checkLevels && !checkYOE) {
    return { accepted: jobs, rejectedCount: 0, levelRejected: 0, yoeRejected: 0 };
  }

  const accepted: Job[] = [];
  let levelRejected = 0;
  let yoeRejected = 0;

  for (const job of jobs) {
    // Check seniority level
    if (checkLevels) {
      const detected = detectSeniority(job.title);
      if (!acceptedLevels.has(detected)) {
        levelRejected++;
        continue;
      }
    }

    // Check YOE requirement
    if (checkYOE) {
      const requiredYOE = parseRequiredYOE(job.descriptionText || "");
      if (requiredYOE > maxReqYOE) {
        yoeRejected++;
        continue;
      }
    }

    accepted.push(job);
  }

  return {
    accepted,
    rejectedCount: levelRejected + yoeRejected,
    levelRejected,
    yoeRejected,
  };
}
