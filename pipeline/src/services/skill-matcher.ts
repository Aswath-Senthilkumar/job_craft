import fs from "fs";
import path from "path";

interface SkillEntry {
  canonical: string;
  aliases: string[];
}

interface SkillMatch {
  canonical: string;
  category: string;
  subcategory: string;
  matchedAs: string; // the exact alias or canonical that was found
}

interface SkillMatchResult {
  matches: SkillMatch[];
  /** De-duplicated canonical skills grouped by top-level category */
  summary: Record<string, Record<string, string[]>>;
  /** Flat list of unique canonical skill names */
  skills: string[];
}

// Pre-compiled lookup: lowercased alias/canonical → { canonical, category, subcategory }
let lookupMap: Map<
  string,
  { canonical: string; category: string; subcategory: string }
> | null = null;

// Sorted entries for multi-word matching (longest first)
let sortedPhrases: {
  phrase: string;
  canonical: string;
  category: string;
  subcategory: string;
}[] = [];

function loadDictionary() {
  if (lookupMap) return;

  const dictPath = path.join(__dirname, "..", "data", "skills-dictionary.json");
  const raw = JSON.parse(fs.readFileSync(dictPath, "utf-8"));

  lookupMap = new Map();
  const phraseSet: typeof sortedPhrases = [];

  for (const [category, subcategories] of Object.entries(raw)) {
    if (category === "_meta") continue;

    for (const [subcategory, entries] of Object.entries(
      subcategories as Record<string, SkillEntry[]>
    )) {
      for (const entry of entries) {
        const allForms = [entry.canonical, ...entry.aliases];
        for (const form of allForms) {
          const lower = form.toLowerCase().trim();
          if (!lower) continue;

          // Don't overwrite existing entries (first match wins — canonical takes priority)
          if (!lookupMap.has(lower)) {
            lookupMap.set(lower, { canonical: entry.canonical, category, subcategory });
          }

          phraseSet.push({
            phrase: lower,
            canonical: entry.canonical,
            category,
            subcategory,
          });
        }
      }
    }
  }

  // Sort longest phrases first for greedy matching
  sortedPhrases = phraseSet.sort((a, b) => b.phrase.length - a.phrase.length);
}

/**
 * Build word-boundary regex for a phrase.
 * Escapes special regex chars and uses \b boundaries.
 */
function phraseRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  // For very short terms (1-2 chars like "C", "R"), require stricter boundaries
  if (phrase.length <= 2) {
    return new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z#\\+])`, "i");
  }
  return new RegExp(`\\b${escaped}\\b`, "i");
}

/**
 * Normalize JD text for reliable keyword matching.
 * Handles Unicode oddities (smart quotes, dashes, zero-width chars),
 * collapses whitespace, and expands slash-separated terms.
 */
function normalizeText(text: string): string {
  return text
    // Strip zero-width characters
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    // Smart quotes → ASCII
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    // Dashes → hyphen (so "full–stack" and "full—stack" become "full-stack")
    .replace(/[\u2013\u2014\u2015]/g, "-")
    // Bullet chars → space (so "•Docker" → " Docker")
    .replace(/[•·■□▪▸►‣⁃]/g, " ")
    // Ellipsis → space
    .replace(/\u2026/g, " ")
    // Non-breaking space → space
    .replace(/\u00A0/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract skills from a job description text using the skills dictionary.
 * Returns de-duplicated, categorized skill matches.
 */
export function extractSkills(text: string): SkillMatchResult {
  loadDictionary();

  const matches: SkillMatch[] = [];
  const seen = new Set<string>(); // track canonical names already matched

  const normalized = normalizeText(text);
  // Also create a variant with hyphens replaced by spaces for flexible matching
  // e.g., "full-stack" → "full stack" so alias "full stack" can match
  const deHyphenated = normalized.replace(/-/g, " ").replace(/\s+/g, " ");

  for (const entry of sortedPhrases) {
    if (seen.has(entry.canonical)) continue;

    const regex = phraseRegex(entry.phrase);
    if (regex.test(normalized) || regex.test(deHyphenated)) {
      seen.add(entry.canonical);
      matches.push({
        canonical: entry.canonical,
        category: entry.category,
        subcategory: entry.subcategory,
        matchedAs: entry.phrase,
      });
    }
  }

  // Build summary grouped by category → subcategory → canonical[]
  const summary: Record<string, Record<string, string[]>> = {};
  for (const m of matches) {
    if (!summary[m.category]) summary[m.category] = {};
    if (!summary[m.category][m.subcategory]) summary[m.category][m.subcategory] = [];
    summary[m.category][m.subcategory].push(m.canonical);
  }

  return {
    matches,
    summary,
    skills: [...seen],
  };
}

/**
 * Compute a relevance score between a resume's skills and a job description's extracted skills.
 * Returns a score 0-10 and details.
 */
export function computeRelevance(
  resumeSkills: string[],
  jobSkills: string[]
): { score: number; matched: string[]; missing: string[]; matchRatio: number; resumeKeywords: string[]; jdKeywords: string[] } {
  const jobSet = new Set(jobSkills.map((s) => s.toLowerCase()));
  const resumeSet = new Set(resumeSkills.map((s) => s.toLowerCase()));

  const matched: string[] = [];
  const missing: string[] = [];

  for (const skill of jobSet) {
    if (resumeSet.has(skill)) {
      matched.push(skill);
    } else {
      missing.push(skill);
    }
  }

  const matchRatio = jobSet.size > 0 ? matched.length / jobSet.size : 0;

  // Score: 0-10 scale
  const score = Math.round(matchRatio * 10);

  return { score, matched, missing, matchRatio, resumeKeywords: resumeSkills, jdKeywords: jobSkills };
}
