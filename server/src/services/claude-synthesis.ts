import Anthropic from "@anthropic-ai/sdk";
import type { WebResearch } from "./tinyfish-research";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TODAY = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export async function generateIntelReport(
  companyName: string,
  jobTitle: string,
  webResearch: WebResearch | null,
  emailContext: any | null,
): Promise<string> {
  const researchBlock = webResearch
    ? `**Web Research Results:**
- Company Overview: ${webResearch.company_overview}
- Recent News: ${webResearch.recent_news}
- Engineering Culture: ${webResearch.engineering_culture}
- Interview Process: ${webResearch.interview_process}
- Common Questions: ${webResearch.common_questions}
- Compensation: ${webResearch.compensation}
- Tips & Red Flags: ${webResearch.tips}`
    : "Web research was not available for this company.";

  const emailBlock = emailContext
    ? `**Email Thread Context (${emailContext.threadCount} emails found):**\n${emailContext.threads.map((t: any) => `- Subject: "${t.subject}" | Date: ${t.date} | Preview: ${t.snippet}`).join("\n")}`
    : "No Gmail thread context available (Gmail not connected or no matching emails).";

  const prompt = `You are an expert interview preparation coach. Generate a comprehensive Company & Interview Intelligence Report in clean markdown format.

Company: ${companyName}
Role: ${jobTitle}

${researchBlock}

${emailBlock}

Generate a detailed markdown document with these sections:

# Company & Interview Intelligence Report
## ${jobTitle} at ${companyName}

## 1. Company Overview
[Mission, products/services, size, stage, key facts]

## 2. Recent News & Developments
[Latest happenings in the past 6 months — funding, launches, acquisitions, milestones]

## 3. Engineering Culture & Tech Stack
[Technologies, engineering values, team structure, open source work]

## 4. Interview Process
[Number of rounds, format of each stage, typical timeline, what to expect]

## 5. Common Interview Questions
[Organised by round type — behavioral, technical, system design — with example questions]

## 6. Compensation Insights
[Salary ranges, equity, total comp benchmarks for this role level]

## 7. Key People
[From email context: recruiter, hiring manager, interviewers if identifiable. Otherwise note "Connect Gmail for personalized details."]

## 8. Tips & Red Flags
[Practical advice from past candidates, common pitfalls, what interviewers value most]

---
*Generated on ${TODAY()}*

Write concisely but thoroughly. Use bullet points for lists. Be factual — if data is unavailable, say so rather than hallucinating.`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected Claude response type");
  return content.text;
}

export async function generatePrepGuide(
  companyName: string,
  jobTitle: string,
  seniorityLevel: string | null,
  jobDescription: string | null,
  jdKeywords: string[],
  matchedKeywords: string[],
  missingKeywords: string[],
  poolSelection: any,
  webResearch: WebResearch | null,
  emailContext: any | null,
): Promise<string> {
  const { profile, experiences, projects, education } = poolSelection;

  const experienceLines = (experiences || []).map((e: any) =>
    `- **${e.title}** at **${e.company}** (${e.start_date} – ${e.end_date || "Present"})\n  ${(e.summary || e.description || "").slice(0, 300)}\n  Skills: ${(e.skills_used || []).join(", ")}`,
  ).join("\n\n");

  const projectLines = (projects || []).map((p: any) =>
    `- **${p.name}**: ${(p.summary || p.description || "").slice(0, 250)}\n  Stack: ${(p.tech_stack || []).join(", ")}`,
  ).join("\n\n");

  const educationLines = (education || []).map((e: any) =>
    `- ${e.degree} in ${e.field || "N/A"} — ${e.institution}`,
  ).join("\n");

  const researchBlock = webResearch
    ? `Interview Process: ${webResearch.interview_process}\nCommon Questions: ${webResearch.common_questions}\nTips: ${webResearch.tips}`
    : "";

  const emailBlock = emailContext
    ? `Interview details from emails:\n${emailContext.threads.map((t: any) => `- "${t.subject}" (${t.date}): ${t.snippet}`).join("\n")}`
    : "";

  const prompt = `You are an expert interview coach. Generate a highly personalised Interview Preparation Guide using the candidate's REAL background.

**Role:** ${jobTitle} at ${companyName}
**Seniority:** ${seniorityLevel || "Mid-level"}

**Job Description:**
${jobDescription ? jobDescription.slice(0, 2000) : "Not available"}

**Skills Analysis:**
- All JD Skills: ${jdKeywords.join(", ") || "Not extracted"}
- Candidate Has: ${matchedKeywords.join(", ") || "None identified"}
- Candidate Missing: ${missingKeywords.join(", ") || "None"}

**Candidate:** ${profile?.name || "Candidate"}

**Experience:**
${experienceLines || "No experience entries found"}

**Projects:**
${projectLines || "No project entries found"}

**Education:**
${educationLines || "Not provided"}

${researchBlock ? `**Company Research:**\n${researchBlock}` : ""}

${emailBlock ? `**Email Context:**\n${emailBlock}` : ""}

Generate a personalised markdown document:

# Personalised Interview Prep Guide
## ${jobTitle} at ${companyName}

## 1. Skills Gap Analysis
| Skill Required | You Have It? | Priority | Notes |
|---|---|---|---|
[Fill in rows for each JD skill — use ✅ / ❌ / ⚠️ Partial for "You Have It?", High/Medium/Low for Priority]

## 2. Technical Topics to Review
[Prioritised list — for each topic: name, depth needed (surface / solid / deep), why it matters for this role]

## 3. Behavioural Stories (STAR Format)
[5–8 stories mapped from the candidate's ACTUAL experiences to common behavioural questions.
Format each as:
**Q: "[Common behavioural question]"**
- **Situation:** [From their real experience at {company}]
- **Task:** [What they needed to accomplish]
- **Action:** [What they specifically did]
- **Result:** [Quantified outcome if possible]
Use real company names, projects, and accomplishments from their profile above.]

## 4. Project Deep-Dives
[For each relevant project: talking points covering architecture decisions, tradeoffs made, scale/impact, what you'd do differently, how it relates to this role]

## 5. Questions to Ask the Interviewer
[8–10 thoughtful, specific questions tailored to ${companyName} and the ${jobTitle} role — not generic ones]

## 6. Interview Logistics
[From email context: date/time, format, interviewer names, any instructions. If no email context: checklist of logistics to confirm before the interview]

## 7. Your 30-Second Elevator Pitch
[A tailored pitch connecting the candidate's specific background to this exact role. Use their real experience and the job's specific requirements. Should feel natural to say aloud.]

---
*Generated on ${TODAY()}*

Be specific and personal — use the candidate's actual experience throughout. Avoid generic advice.`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected Claude response type");
  return content.text;
}
