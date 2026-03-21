import { Job } from "../types";
import { log } from "../logger";
import { config } from "../config";

/**
 * Build allowed country list from TARGET_COUNTRIES env.
 * Supports country names like "United States", "India", "Remote".
 */
function buildAllowedCountries(): string[] {
  return config.TARGET_COUNTRIES
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

// Patterns that indicate the remote job restricts to specific regions
const REMOTE_EXCLUDED_PATTERNS = /\b(us[- ]only|usa[- ]only|north america only|canada only|india only|apac only|us[- ]based|usa[- ]based|must be (based |located )?(in )?(the )?us\b|united states only)\b/i;

// Patterns that indicate remote job is open to worldwide
const REMOTE_INCLUSIVE_PATTERNS = /\b(worldwide|global|anywhere|work from anywhere|open to all|all locations|no location restriction)\b/i;

// Placeholder strings that carry no real location info — keep them (let Gemini decide)
const PLACEHOLDER_PATTERN = /^(n\/a|na|not specified|not available|tbd|tba|location|various|multiple|see job description|multiple locations?)$/i;

// US state abbreviations (2-letter) — e.g. "San Francisco, CA"
const US_STATE_ABBR = new Set([
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia",
  "ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
  "nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt",
  "va","wa","wv","wi","wy","dc",
]);

// Major US cities (standalone, without state suffix)
const US_CITIES = new Set([
  "new york","new york city","nyc","los angeles","la","san francisco","sf","seattle",
  "chicago","boston","austin","denver","atlanta","dallas","houston","miami","portland",
  "san jose","san diego","washington","washington dc","philadelphia","phoenix","detroit",
  "minneapolis","nashville","raleigh","charlotte","salt lake city","las vegas",
  "pittsburgh","columbus","indianapolis","kansas city","st louis","orlando","tampa",
  "san antonio","baltimore","sacramento","richmond","cleveland","cincinnati",
  "new orleans","hartford","buffalo","memphis","louisville","oklahoma city",
  "tucson","albuquerque","fresno","long beach","mesa","colorado springs",
  "virginia beach","oakland","minneapolis","tulsa","wichita","arlington",
  "sunnyvale","santa clara","palo alto","mountain view","menlo park","redwood city",
  "bellevue","kirkland","redmond","cupertino","san mateo","burlingame",
]);

// US airport codes commonly used as shorthand in tech job postings
const US_AIRPORT_CODES = new Set([
  "sea","sfo","lax","jfk","ewr","ord","atl","dfw","iah","mia","bos","den",
  "pdx","slc","phx","msp","dtw","phl","iad","dca","bwi","rdu","clt","aus",
  "mco","tpa","stl","cvg","cmh","ind","mke","pit","buf","bna","mem","okc",
  "tul","abq","fre","oak","sjc","san","smf",
]);

// Indian cities and state names commonly seen in job locations
const INDIA_LOCATION_TERMS = new Set([
  "india","bengaluru","bangalore","mumbai","delhi","new delhi","hyderabad","chennai",
  "pune","kolkata","noida","gurgaon","gurugram","ahmedabad","jaipur","kochi","indore",
  "chandigarh","coimbatore","nagpur","mysuru","mysore","vadodara","surat",
  "thiruvananthapuram","visakhapatnam","vizag","bhubaneswar","lucknow","patna",
  "mohali","trivandrum","mangalore","bhopal","agra","nashik","rajkot","faridabad",
]);

/**
 * Normalise the location field.
 */
function normaliseLocation(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw.toLowerCase();
  if (typeof raw === "object") return JSON.stringify(raw).toLowerCase();
  return String(raw).toLowerCase();
}

/**
 * Infer the country from a single location segment (city, abbr, code).
 */
function inferCountriesFromSegment(seg: string): Set<string> {
  const inferred = new Set<string>();
  const s = seg.trim();

  // US state abbreviation at end of segment: "San Francisco, CA" or "City CA"
  const stateMatch = s.match(/[,\s\-]+([a-z]{2})\s*$/);
  if (stateMatch && US_STATE_ABBR.has(stateMatch[1])) {
    inferred.add("united states");
  }

  // Standalone 2-letter segment that is a US state abbr or airport code
  if (/^[a-z]{2,3}$/.test(s)) {
    if (US_STATE_ABBR.has(s) || US_AIRPORT_CODES.has(s)) {
      inferred.add("united states");
    }
  }

  // US explicit patterns
  if (/\busa\b|\bu\.s\.a?\b|\bunited states\b/.test(s)) {
    inferred.add("united states");
  }

  // US city name match
  if (US_CITIES.has(s)) {
    inferred.add("united states");
  }
  // Partial match for compound city names
  for (const city of US_CITIES) {
    if (s.includes(city)) {
      inferred.add("united states");
      break;
    }
  }

  // India detection
  for (const term of INDIA_LOCATION_TERMS) {
    if (s.includes(term)) {
      inferred.add("india");
      break;
    }
  }

  return inferred;
}

/**
 * Infer countries from a full location string, splitting on common delimiters
 * to handle multi-city strings like "San Francisco, Seattle, New York City".
 */
function inferCountries(loc: string): Set<string> {
  const inferred = new Set<string>();

  // First try the whole string
  for (const c of inferCountriesFromSegment(loc)) inferred.add(c);
  if (inferred.size > 0) return inferred;

  // Split on "/" and check each segment (handles "SEA, SF" → ["SEA", "SF"])
  // Use a broader split: comma+space OR slash OR " - " OR " / "
  const segments = loc.split(/[/]|\s*-\s*(?=[a-z])/);
  for (const rawSeg of segments) {
    // Within each segment, try the whole segment and also just the last word/abbr
    for (const c of inferCountriesFromSegment(rawSeg.trim())) inferred.add(c);

    // Also try individual words/tokens within segment (catches "SEA, SF" → "sea", "sf")
    const tokens = rawSeg.split(/[\s,]+/).filter(Boolean);
    for (const tok of tokens) {
      for (const c of inferCountriesFromSegment(tok.trim())) inferred.add(c);
    }
  }

  return inferred;
}

/**
 * Check if a location string or description mentions any allowed country.
 * Also handles city/state patterns for US and India.
 */
function matchesCountry(text: string, allowedCountries: string[]): boolean {
  if (allowedCountries.some((country) => text.includes(country))) return true;
  const inferred = inferCountries(text);
  return allowedCountries.some((c) => inferred.has(c));
}

/**
 * Check if any allowed country is explicitly excluded by a remote-restriction pattern.
 */
function isExcludedRemote(text: string, allowedCountries: string[]): boolean {
  if (allowedCountries.includes("remote") || allowedCountries.includes("worldwide")) {
    return false;
  }
  return REMOTE_EXCLUDED_PATTERNS.test(text);
}

/**
 * Country-level location filter — accepts jobs in TARGET_COUNTRIES, rejects others.
 */
export function filterByLocation(jobs: Job[]): Job[] {
  const allowedCountries = buildAllowedCountries();
  const acceptRemote = allowedCountries.includes("remote");
  const passed: Job[] = [];
  let droppedCount = 0;

  if (jobs.length > 0) {
    const sampleLocs = jobs.slice(0, 5).map((j) => (j as any).location);
    log.info(`  [debug] Sample location values: ${JSON.stringify(sampleLocs)}`);
  }

  for (const job of jobs) {
    const raw = job as any;

    const rawLocStr: string = raw.location || "";

    // Step 0: Placeholder location → keep (let AI relevance check decide)
    if (PLACEHOLDER_PATTERN.test(rawLocStr.trim())) {
      passed.push(job);
      continue;
    }

    // Build full location string from all possible fields
    const loc = [
      normaliseLocation(raw.location),
      normaliseLocation(raw.jobLocation),
      normaliseLocation(raw.locationName),
      normaliseLocation(raw.locationText),
      normaliseLocation(raw.place),
    ].join(" ").trim();

    const descSnippet = (job.descriptionText || "").toLowerCase().slice(0, 2000);
    const combined = `${loc} ${descSnippet}`;

    // Step 1: Worldwide/global/anywhere patterns → accept if user wants remote
    if (acceptRemote && REMOTE_INCLUSIVE_PATTERNS.test(loc)) {
      if (!isExcludedRemote(combined, allowedCountries)) {
        passed.push(job);
        continue;
      }
    }

    // Step 2: Direct country match in location field (handles "United States", "India", etc.)
    if (matchesCountry(loc, allowedCountries.filter((c) => c !== "remote"))) {
      passed.push(job);
      continue;
    }

    // Step 3: Remote/hybrid signals in location string
    const isRemote = /remote|hybrid|wfh|work from home|remote.?first/i.test(loc);
    if (isRemote) {
      if (acceptRemote && !isExcludedRemote(combined, allowedCountries)) {
        passed.push(job);
        continue;
      }
      // Remote + description mentions target country → accept
      if (matchesCountry(descSnippet, allowedCountries.filter((c) => c !== "remote"))) {
        passed.push(job);
        continue;
      }
    }

    // Step 4: Empty location → check description only
    if (!loc.trim()) {
      if (matchesCountry(descSnippet, allowedCountries.filter((c) => c !== "remote"))) {
        passed.push(job);
        continue;
      }
      // No location at all → keep (unknown = give benefit of doubt)
      passed.push(job);
      continue;
    }

    // Step 5: Check description for country match (non-remote jobs with a real location)
    if (matchesCountry(descSnippet, allowedCountries.filter((c) => c !== "remote"))) {
      passed.push(job);
      continue;
    }

    // Step 6: No match → DROP
    droppedCount++;
    if (droppedCount <= 20) {
      log.info(`  [dropped] "${job.title}" @ "${job.companyName}" — no target country in: "${rawLocStr}"`);
    }
  }

  if (droppedCount > 0) {
    log.info(`  ${droppedCount} total jobs dropped (outside target countries: ${config.TARGET_COUNTRIES})`);
  }

  return passed;
}
