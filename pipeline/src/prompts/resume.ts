export const RESUME_SYSTEM_PROMPT = `You are a senior resume writer. You write resumes that pass ATS, read like they were written by a precise human, and make hiring managers want to call.

Return ONLY valid JSON. No backticks. No markdown. No explanations. No text outside the JSON object. Your entire response must begin with { and end with }.

Do not use em dashes (—) anywhere in the output. Use commas or periods instead.`;

export function buildResumeUserPrompt(
  resumeText: string,
  jobDescription: string,
  tailoringIntensity: number = 5,
  resumeKeywords: string[] = [],
  jdKeywords: string[] = []
): string {
  let intensityInstruction: string;
  if (tailoringIntensity <= 3) {
    intensityInstruction = `TAILORING INTENSITY: LOW (${tailoringIntensity}/10)
- Keep the candidate's original bullet points mostly intact. Only make light edits for clarity.
- Add JD-relevant keywords naturally where they fit, but do NOT rewrite sentences wholesale.
- Preserve the candidate's authentic voice and phrasing.
- Skills section: add JD-relevant skills that appear in experience, but keep all existing skills.
- Summary: only adjust 1-2 phrases to reference the target role. Do not rewrite from scratch.
- The resume should feel like the candidate's own work with minor polish, not a machine rewrite.`;
  } else if (tailoringIntensity <= 6) {
    intensityInstruction = `TAILORING INTENSITY: MEDIUM (${tailoringIntensity}/10)
- Rewrite bullet points to better match JD terminology and highlight relevant experience.
- Mirror the job description's language for tools, methodologies, and domain terms.
- Each bullet should clearly connect the candidate's experience to what this role needs.
- Skills section: reorder to prioritize JD skills, add missing ones that appear in experience.
- Summary: rewrite to directly address the target role and its key requirements.
- Balance between the candidate's authentic experience and strong JD alignment.`;
  } else {
    intensityInstruction = `TAILORING INTENSITY: HIGH (${tailoringIntensity}/10)
- Aggressively rewrite every bullet point to maximize alignment with the job description.
- Use the exact terminology, tools, and phrases from the JD wherever the candidate has matching experience.
- Every bullet must read as if the candidate was specifically preparing for THIS role.
- Skills section: restructure completely around JD priorities, front-load exact JD terms.
- Summary: craft specifically for this role, using JD language throughout.
- Maximize ATS keyword match rate. The resume should feel purpose-built for this specific position.
- Still do NOT fabricate experience or metrics — only reframe and emphasize what exists.`;
  }

  const missingSkills = jdKeywords.filter(
    (s) => !resumeKeywords.map((r) => r.toLowerCase()).includes(s.toLowerCase())
  );

  const skillContext = jdKeywords.length > 0 ? `
---

SKILL CONTEXT (from local analysis — use this to inform your tailoring decisions)

Skills found in the candidate's resume: ${resumeKeywords.join(", ")}

Skills found in the job description: ${jdKeywords.join(", ")}

Skills in JD but MISSING from resume: ${missingSkills.length > 0 ? missingSkills.join(", ") : "None"}

Instructions for using this context:
- Use the matched skills to prioritize which experience bullets to emphasize and which JD terms to mirror.
- For missing skills: ONLY add them to the skills section or bullet points if the candidate's existing experience reasonably supports them. For example, if the JD requires "Kubernetes" and the resume shows "Docker" experience, it is reasonable to mention container orchestration knowledge. If the JD requires "Salesforce" and the resume has zero CRM experience, do NOT add it.
- NEVER fabricate experience, certifications, or skills the candidate does not have.
- This context supplements (does not replace) your own STEP 1 analysis of the JD.
` : "";

  return `${intensityInstruction}
${skillContext}
---

STEP 1 — ANALYSE THE JOB DESCRIPTION

Before writing anything, you must think through the following and record your analysis in the \`jd_analysis\` block of the output JSON. This block is required. Do not skip it or leave it empty.

Extract and record:
- \`domain\`: The professional domain (engineering, marketing, finance, design, operations, etc.)
- \`seniority\`: Seniority signals found in the JD (e.g. "own end-to-end", "lead", "drive decisions", "collaborate cross-functionally")
- \`core_stack\`: The 5-8 most important hard skills, tools, platforms, or frameworks the JD screens for
- \`business_context\`: What this company does and what problem this role solves for them
- \`methodologies\`: Any specific methodologies or frameworks mentioned (Agile, Six Sigma, OKRs, etc.)
- \`screened_skills\`: The 3-5 skills a recruiter would use to instantly disqualify a candidate

Every tailoring decision in Steps 2-6 must be grounded in this analysis. If a bullet rewrite or skills reorder cannot be traced back to something in \`jd_analysis\`, do not make the change.

---

STEP 2 — BULLET POINT REWRITING

Every experience bullet point must follow this formula:

  Strong action verb + specific tool or method + scale or context + measurable outcome or business impact

Examples of weak vs strong:

WEAK: "Managed projects for clients"
STRONG: "Led 8 concurrent client projects with combined budgets of $2.4M, delivering all on time and cutting average cycle time by 22%"

WEAK: "Helped improve the website"
STRONG: "Redesigned checkout flow using React and A/B testing, increasing conversion rate from 2.1% to 3.8% across 50K monthly users"

WEAK: "Worked with cloud infrastructure to support workflows"
STRONG: "Migrated 12 production services from on-prem to AWS ECS, reducing infrastructure costs by 30% and cutting deployment time from 4 hours to 15 minutes"

Rules:
- Lead with an action verb. Never start with "Responsible for", "Helped", "Assisted", "Worked on", or "Was involved in".
- Include at least one number, scale indicator, or concrete outcome per bullet where the original contains enough context to infer one.
- Do not fabricate metrics. If no metric exists and none can be reasonably inferred from the original, strengthen the action and outcome language instead.
- Mirror the exact technical terminology used in the JD. If the JD says "CI/CD pipelines", do not write "deployment workflows".
- Keep each bullet approximately the same character length as the original. Dense and specific, not verbose.
- Vary the opening action verbs across bullet points within the same role. Do not repeat the same verb twice.
- Set \`improved\` to null only if the original bullet is already strong, specific, and closely matches JD language. When in doubt, improve it.

---

STEP 3 — ANTI-AI-WRITING RULES

The resume must read like it was written by a precise, experienced human. Actively remove all of the following patterns.

BANNED VOCABULARY — do not use these words anywhere in the output:

Significance inflation:
pivotal, crucial, vital, key (as filler adjective), groundbreaking, transformative, enduring, remarkable, impactful, meaningful, valuable, exceptional

Promotional / AI-slop:
showcasing, highlighting, underscoring, emphasizing, fostering, cultivating, encompassing, contributing to, vibrant, profound, nestled, renowned, breathtaking, innovative, dynamic, robust, cutting-edge, next-generation, state-of-the-art

Overused AI vocabulary:
Additionally (as sentence opener), Furthermore, Moreover, align with, delve, enhance, garner, landscape, tapestry, testament, interplay, intricacies, synergy, seamless, ecosystem (abstract use), serves as, stands as, functions as, boasts, features (when replacing "is/has"), underscores, reflects, symbolizes, demonstrates (when used to pad significance)

Resume-specific AI cliches — never write these:
"hands-on experience", "proven track record", "results-driven", "detail-oriented", "self-starter", "fast learner", "team player", "excellent communication", "strong communicator", "passionate about", "excited to", "eager to", "effectively communicated", "worked collaboratively", "in a fast-paced environment", "leveraged", "utilized" (use "used" or name the specific action)
"industry-leading", "world-class", "best-in-class", "enterprise-grade"

Structural anti-patterns — never use these constructions:
- "not just X but Y" (negative parallelism)
- Listing three near-identical things just to pad length (rule-of-three stuffing)
- Generic conclusions: "successfully delivered", "resulting in improved outcomes", "driving business value", "contributing to company success"
- Vague attributions: "industry experts say", "leading companies use", "it is widely known"

INSTEAD: Use direct, specific language. Say exactly what was built, what it did, and what changed because of it. Every sentence must contain a specific tool, a number, or a concrete outcome — not a vague claim.

Wrong: "Developed scalable solutions showcasing expertise in modern technologies, fostering cross-team collaboration and contributing to improved operational efficiency."
Right: "Built an automated reporting pipeline processing 10K records/day, replacing a 6-hour manual spreadsheet process and saving the ops team 30 hours per week."

---

STEP 4 — SKILLS SECTION

Logic:
1. Start with the candidate's existing skills as the base.
2. Add skills from the JD that appear in the candidate's experience or projects (even if not in the skills section explicitly).
3. Keep existing skills not in the JD unless they are genuinely irrelevant to the candidate's field.
4. Do not remove valid skills.
5. Within each category, list the most JD-relevant items first.
6. Categorize skills into these 5 groups:
   - languages: Programming languages (Java, Python, TypeScript, etc.)
   - frameworks: Frameworks and libraries (Spring Boot, React, TensorFlow, etc.)
   - dataAndMiddleware: Databases, message queues, data tools (PostgreSQL, Kafka, Redis, etc.)
   - cloudAndDevops: Cloud platforms, CI/CD, containers (AWS, Docker, Kubernetes, etc.)
   - testingAndTools: Testing frameworks, dev tools, version control (JUnit, Jest, Git, etc.)
7. The skills section should feel populated and comprehensive, not sparse.

---

STEP 5 — SUMMARY

Rules:
- Keep the existing summary as the structural base. Do not rewrite from scratch.
- Open with the candidate's actual role and years of experience.
- Reference the target job title or domain directly, using the JD's language.
- Include 2-3 of the most critical capabilities the JD screens for (from \`jd_analysis.screened_skills\`).
- End with a phrase about business impact or the type of team and environment they perform best in.
- No first-person pronouns.
- 3-4 sentences maximum. Dense and specific.
- Do not use any banned vocabulary from Step 3.
- Do not use: "passionate about", "strong communicator", "results-driven professional", "dynamic", "detail-oriented".

---

STEP 6 — HARD CONSTRAINTS

One-page discipline:
- Maximum 4 bullet points per role (keep only the highest-impact ones).
- Summary: 3 sentences maximum, no padding.
- Skills: comma-separated on a single line per category, no extra whitespace.
- Bullet points must be dense and concise, one line each.
- Cut any section that has no data (empty arrays) completely from the output.

Integrity constraints:
- Preserve company names, job titles, locations, and dates exactly as in the original resume.
- Maintain the same section order and structure.
- Keep the same number of bullet points per role as the original (subject to the 4-bullet maximum).
- Do not fabricate experience, roles, achievements, or metrics.
- Do not invent numbers with no basis in the original text.
- If a section has no data, return an empty array [] — never omit the key.
- No markdown, no bold, no italics in any text field.
- No em dashes (—) anywhere.

---

INPUT

Resume:
${resumeText}

Job Description:
${jobDescription}

---

OUTPUT FORMAT

Return ONLY valid JSON following this exact structure. No trailing commas. No text outside the object.

{
  "jd_analysis": {
    "domain": "string",
    "seniority": "string",
    "core_stack": ["string"],
    "business_context": "string",
    "methodologies": ["string"],
    "screened_skills": ["string"]
  },
  "resumeData": {
    "personalInfo": {
      "name": "string",
      "phone": "string",
      "email": "string",
      "linkedin": "url or empty",
      "github": "url or empty",
      "portfolio": "url or empty"
    },
    "summary": "string or empty",
    "education": [
      {
        "institution": "string",
        "date": "string",
        "degree": "string",
        "gpa": "string or empty"
      }
    ],
    "skills": {
      "languages": "string",
      "frameworks": "string",
      "dataAndMiddleware": "string",
      "cloudAndDevops": "string",
      "testingAndTools": "string"
    },
    "experience": [
      {
        "title": "string",
        "company": "string",
        "date": "string",
        "location": "string",
        "summary": "string (max 6 words, or empty)",
        "bulletPoints": [
          {
            "original": "string",
            "improved": "string or null"
          }
        ]
      }
    ],
    "projects": [
      {
        "title": "string",
        "link": "url or empty",
        "date": "string",
        "summary": "string (max 6 words, or empty)",
        "location": "string or empty",
        "bulletPoints": [
          {
            "original": "string",
            "improved": "string or null"
          }
        ]
      }
    ],
    "certifications": [
      {
        "name": "string",
        "issuer": "string",
        "date": "string"
      }
    ],
    "awards": [
      {
        "title": "string",
        "issuer": "string",
        "date": "string"
      }
    ]
  }
}

Field rules:
- original: copied verbatim from the resume, no changes ever
- improved: the rewritten version following all rules above, or null if the bullet is already strong and closely matches JD language
- Only set improved to null if the original is genuinely strong. When in doubt, improve it.
- All tailoring decisions must be traceable to jd_analysis. If a change cannot be justified by the analysis, do not make it.

Respond with ONLY the JSON object.`;
}

export function buildBulletEnhancementPrompt(
  pool: import("../types").PoolSelection,
  jobDescription: string,
  tailoringIntensity: number = 5,
  resumeKeywords: string[] = [],
  jdKeywords: string[] = []
): string {
  let intensityInstruction: string;
  if (tailoringIntensity <= 3) {
    intensityInstruction = `TAILORING INTENSITY: LOW (${tailoringIntensity}/10)
- Keep the candidate's original bullet points mostly intact. Only make light edits for clarity.
- Add JD-relevant keywords naturally where they fit, but do NOT rewrite sentences wholesale.
- Preserve the candidate's authentic voice and phrasing.`;
  } else if (tailoringIntensity <= 6) {
    intensityInstruction = `TAILORING INTENSITY: MEDIUM (${tailoringIntensity}/10)
- Rewrite bullet points to better match JD terminology and highlight relevant experience.
- Mirror the job description's language for tools, methodologies, and domain terms.`;
  } else {
    intensityInstruction = `TAILORING INTENSITY: HIGH (${tailoringIntensity}/10)
- Aggressively rewrite every bullet point to maximize alignment with the job description.
- Use the exact terminology, tools, and phrases from the JD wherever the candidate has matching experience.
- Maximize ATS keyword match rate. Still do NOT fabricate experience or metrics.`;
  }

  const missingSkills = jdKeywords.filter(
    (s) => !resumeKeywords.map((r) => r.toLowerCase()).includes(s.toLowerCase())
  );

  const skillContext = jdKeywords.length > 0 ? `
---

SKILL CONTEXT (from local analysis)

Skills from candidate's pool: ${resumeKeywords.join(", ")}
Skills found in job description: ${jdKeywords.join(", ")}
Skills in JD but MISSING from pool: ${missingSkills.length > 0 ? missingSkills.join(", ") : "None"}

For missing skills: ONLY add them if the candidate's existing experience reasonably supports them. NEVER fabricate.
` : "";

  const { experiences, projects, skills } = pool;

  const experienceSection = experiences.length > 0 ? `
WORK EXPERIENCE BULLETS TO ENHANCE
${experiences.map((exp: any) => {
    const bullets = exp.description.split("\n").filter((l: string) => l.trim()).map((l: string) => {
      const clean = l.replace(/^[-•]\s*/, "").trim();
      return `  - ${clean}`;
    }).join("\n");
    return `[${exp.title} | ${exp.company}]\n${bullets}`;
  }).join("\n\n")}` : "";

  const projectSection = projects.length > 0 ? `
PROJECT BULLETS TO ENHANCE
${projects.map((proj: any) => {
    const bullets = proj.description.split("\n").filter((l: string) => l.trim()).map((l: string) => {
      const clean = l.replace(/^[-•]\s*/, "").trim();
      return `  - ${clean}`;
    }).join("\n");
    return `[${proj.name}]\n${bullets}`;
  }).join("\n\n")}` : "";

  const skillEntries = [
    skills.languages && `Languages: ${skills.languages}`,
    skills.frameworks && `Frameworks: ${skills.frameworks}`,
    skills.dataAndMiddleware && `Data & Middleware: ${skills.dataAndMiddleware}`,
    skills.cloudAndDevops && `Cloud & DevOps: ${skills.cloudAndDevops}`,
    skills.testingAndTools && `Testing & Tools: ${skills.testingAndTools}`,
  ].filter(Boolean);
  const skillsSection = skillEntries.length > 0 ? `
SKILLS POOL (curated for this application)
${skillEntries.join("\n")}` : "";

  return `${intensityInstruction}
${skillContext}
---

YOUR TASK: Enhance ONLY the bullet points, summary, and skills section. The pipeline handles all other fields (personal info, education, dates, structure). You return ONLY the enhanced content.

---

STEP 1 — ANALYSE THE JOB DESCRIPTION

Record your analysis in the \`jd_analysis\` block. Extract:
- \`domain\`: The professional domain
- \`seniority\`: Seniority signals in the JD
- \`core_stack\`: The 5-8 most important hard skills/tools
- \`business_context\`: What this company does and what problem this role solves
- \`methodologies\`: Any specific methodologies mentioned
- \`screened_skills\`: The 3-5 skills a recruiter would use to instantly disqualify a candidate

---

STEP 2 — BULLET POINT ENHANCEMENT

Every bullet must follow: Strong action verb + specific tool or method + scale or context + measurable outcome

Rules:
- Lead with an action verb. Never start with "Responsible for", "Helped", "Assisted", "Worked on".
- Include at least one number, scale indicator, or concrete outcome per bullet where the original contains enough context to infer one.
- Do not fabricate metrics. If no metric exists and none can be reasonably inferred, strengthen the action and outcome language instead.
- Mirror the exact technical terminology used in the JD. If the JD says "CI/CD pipelines", do not write "deployment workflows".
- Keep each bullet approximately the same character length as the original.
- Vary the opening action verbs within the same role. Do not repeat the same verb twice.
- Set \`improved\` to null ONLY if the original bullet is already strong, specific, and closely matches JD language.

---

STEP 3 — ANTI-AI-WRITING RULES

BANNED: pivotal, crucial, vital, groundbreaking, transformative, showcasing, fostering, innovative,
dynamic, robust, cutting-edge, leveraged, utilized, synergy, seamless, "proven track record",
"results-driven", "detail-oriented", "passionate about", "team player", "hands-on experience",
"effectively communicated", "worked collaboratively", "in a fast-paced environment"

Use direct, specific language. Every sentence must contain a specific tool, a number, or a concrete outcome.

---

STEP 4 — SKILLS SECTION

Build from the SKILLS POOL. Add JD-relevant skills that appear in experience descriptions.
Prioritize JD-relevant skills first. Format as comma-separated strings per category:
- languages: Programming languages (Java, Python, TypeScript, etc.)
- frameworks: Frameworks and libraries (Spring Boot, React, TensorFlow, etc.)
- dataAndMiddleware: Databases, message queues, data tools (PostgreSQL, Kafka, Redis, etc.)
- cloudAndDevops: Cloud platforms, CI/CD, containers (AWS, Docker, Kubernetes, etc.)
- testingAndTools: Testing frameworks, dev tools, version control (JUnit, Jest, Git, etc.)

---

STEP 5 — SUMMARY

3-4 sentences. Open with role and years of experience. Reference target job title using JD language.
Include 2-3 critical capabilities from screened_skills. No first-person pronouns. No banned vocabulary.

---

INPUT
${experienceSection}
${projectSection}
${skillsSection}

Job Description:
${jobDescription}

---

OUTPUT FORMAT

Return ONLY valid JSON. No backticks. No markdown. Your response must begin with { and end with }.

CRITICAL: You must include ALL experiences and ALL projects listed above. Match them by title/company (experience) or name (project) EXACTLY as provided. Do not skip, merge, or reorder any entries.

{
  "jd_analysis": {
    "domain": "string",
    "seniority": "string",
    "core_stack": ["string"],
    "business_context": "string",
    "methodologies": ["string"],
    "screened_skills": ["string"]
  },
  "summary": "string",
  "skills": {
    "languages": "string",
    "frameworks": "string",
    "dataAndMiddleware": "string",
    "cloudAndDevops": "string",
    "testingAndTools": "string"
  },
  "experience": [
    {
      "title": "exact title from input",
      "company": "exact company from input",
      "bullets": [
        { "original": "exact original bullet text", "improved": "enhanced version or null" }
      ]
    }
  ],
  "projects": [
    {
      "name": "exact project name from input",
      "bullets": [
        { "original": "exact original bullet text", "improved": "enhanced version or null" }
      ]
    }
  ]
}

Field rules:
- original: copied VERBATIM from the input bullets above. No changes ever.
- improved: the rewritten version following all rules, or null if the original is already strong.
- experience and projects arrays must have the SAME number of entries as the input, in the SAME order.
- Each entry must have the SAME number of bullets as the input.

Respond with ONLY the JSON object.`;
}
