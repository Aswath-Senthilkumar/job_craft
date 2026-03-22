import { ResumeData, BulletPoint } from "../types";
import { log } from "../logger";

const CHARS_PER_LINE = 119;
const PAGE_CAPACITY = 66;
const FIXED_OVERHEAD = 38;

function bulletLines(text: string): number {
  return Math.ceil(text.length / CHARS_PER_LINE);
}

function effectiveText(bp: BulletPoint): string {
  return bp.improved ?? bp.original;
}

/** Detect if a bullet is "safe" to shorten: no metrics, no outcome numbers, collaboration/process language. */
function isSafeBullet(text: string): boolean {
  // Reject if it contains a metric (number + unit/percentage) or a standalone outcome number
  if (/\d+\s*%/.test(text)) return false;
  if (/\d+x\b/i.test(text)) return false;
  if (/\d+\s*(ms|s|kb|mb|gb|k|m)\b/i.test(text)) return false;
  // Reject if it contains any standalone number (likely a metric or outcome)
  if (/\b\d+\b/.test(text)) return false;
  return true;
}

/**
 * Trim text to at most maxLen characters at a word boundary.
 * Never cuts mid-word.
 */
function trimToWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(" ", maxLen);
  return cut > 0 ? text.slice(0, cut) : text.slice(0, maxLen);
}

/**
 * Post-processing step between Claude response and PDF generator.
 * Detects orphan risk (projects heading appearing at the very bottom of page 1
 * with no bullets) and trims the single safest experience bullet by one rendered
 * line to push projects onto a clean position.
 *
 * Does not touch any other fields on resumeData.
 */
export function fixOrphanRisk(resumeData: ResumeData): ResumeData {
  const experience = resumeData.experience ?? [];
  const projects = resumeData.projects ?? [];

  // Compute bullet line counts
  const expBulletLines = experience.flatMap(e =>
    (e.bulletPoints ?? []).map(bp => bulletLines(effectiveText(bp)))
  );
  const projBulletLines = projects.flatMap(p =>
    (p.bulletPoints ?? []).map(bp => bulletLines(effectiveText(bp)))
  );

  const totalExpBulletLines = expBulletLines.reduce((a, b) => a + b, 0);
  const totalProjBulletLines = projBulletLines.reduce((a, b) => a + b, 0);
  const projHeaderLines = projects.length; // one header line per project (title/date/location row)

  const totalLines = totalExpBulletLines + totalProjBulletLines + FIXED_OVERHEAD;
  const linesBeforeProjects = totalLines - totalProjBulletLines - projHeaderLines - 1;
  const remainder = linesBeforeProjects % PAGE_CAPACITY;
  const linesRemainingOnPage1 = remainder === 0 ? PAGE_CAPACITY : PAGE_CAPACITY - remainder;

  if (linesRemainingOnPage1 >= 4) {
    return resumeData; // No orphan risk
  }

  log.info(`Layout: ${linesRemainingOnPage1} line(s) remain on page 1 before projects — orphan risk, trimming...`);

  // Work on a shallow copy so we don't mutate in place unexpectedly
  const adjusted = { ...resumeData, experience: experience.map(e => ({ ...e, bulletPoints: [...(e.bulletPoints ?? [])] })) };
  let remaining = linesRemainingOnPage1;

  while (remaining < 4) {
    // Build a flat list of candidate bullets from experience (not projects)
    const candidates: Array<{ expIdx: number; bpIdx: number; text: string; lines: number; safe: boolean }> = [];

    for (let ei = 0; ei < adjusted.experience.length; ei++) {
      const bps = adjusted.experience[ei].bulletPoints ?? [];
      for (let bi = 0; bi < bps.length; bi++) {
        const text = effectiveText(bps[bi]);
        const lines = bulletLines(text);
        if (lines < 2) continue; // can't shorten a 1-line bullet
        candidates.push({ expIdx: ei, bpIdx: bi, text, lines, safe: isSafeBullet(text) });
      }
    }

    if (candidates.length === 0) break;

    // Prefer safe bullets; fall back to any multi-line bullet
    const pool = candidates.filter(c => c.safe).length > 0
      ? candidates.filter(c => c.safe)
      : candidates;

    // Pick the longest safe bullet (most room to trim without damaging quality)
    pool.sort((a, b) => b.text.length - a.text.length);
    const target = pool[0];

    const maxLen = (target.lines - 1) * CHARS_PER_LINE;
    const trimmed = trimToWordBoundary(target.text, maxLen);

    if (bulletLines(trimmed) >= target.lines) break; // trimming had no effect

    // Apply: if the bullet has an improved version, trim that; otherwise trim original
    const bp = adjusted.experience[target.expIdx].bulletPoints[target.bpIdx];
    if (bp.improved !== null && bp.improved !== undefined) {
      adjusted.experience[target.expIdx].bulletPoints[target.bpIdx] = { ...bp, improved: trimmed };
    } else {
      adjusted.experience[target.expIdx].bulletPoints[target.bpIdx] = { ...bp, original: trimmed };
    }

    remaining += 1;
    log.info(`Layout: trimmed bullet in experience[${target.expIdx}] — lines ${target.lines} → ${target.lines - 1}, remaining on page 1 now ${remaining}`);
  }

  if (remaining < 4) {
    log.warn(`Layout: orphan risk persists after trimming (${remaining} line(s) remaining) — no safe bullets found`);
  }

  return adjusted;
}
