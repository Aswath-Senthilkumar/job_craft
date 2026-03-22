export interface WebResearch {
  company_overview: string;
  recent_news: string;
  engineering_culture: string;
  interview_process: string;
  common_questions: string;
  compensation: string;
  tips: string;
}

export async function researchCompany(
  companyName: string,
  jobTitle: string,
  location: string | null,
  companyUrl?: string | null,
): Promise<WebResearch | null> {
  const apiKey = process.env.TINYFISH_API_KEY;

  if (!apiKey) {
    console.warn("[TinyFish] TINYFISH_API_KEY not configured — skipping web research");
    return null;
  }

  const searchQuery = encodeURIComponent(`${companyName} ${jobTitle} interview glassdoor`);
  const startUrl = companyUrl || `https://www.google.com/search?q=${searchQuery}`;
  console.log(`[TinyFish] Starting research at: ${startUrl}`);

  const goal = `Research ${companyName} for a ${jobTitle} interview preparation. Browse relevant sources (company website, Glassdoor, Blind, LinkedIn, news sites). Location context: ${location || "Remote/Not specified"}.

Return a JSON object with exactly these keys:
{
  "company_overview": "Company mission, products/services, size, funding stage, key facts",
  "recent_news": "Latest developments, product launches, acquisitions, funding rounds in the past 6 months",
  "engineering_culture": "Tech stack, engineering blog highlights, open source work, team structure, engineering values",
  "interview_process": "Number of rounds, format details (phone screen, technical, system design, behavioral, hiring manager), typical timeline",
  "common_questions": "Common interview questions by round type: behavioral, technical, system design",
  "compensation": "Salary range and equity for ${jobTitle} level roles at ${companyName}",
  "tips": "Tips and red flags from past candidates on Glassdoor, Blind, or Reddit"
}

IMPORTANT: Return ONLY the JSON object, no markdown wrapping, no explanation.`;

  try {
    const res = await fetch("https://agent.tinyfish.ai/v1/automation/run-sse", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: startUrl, goal }),
      signal: AbortSignal.timeout(480000), // 8 min — TinyFish can take 6-7 min on complex companies
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[TinyFish] Agent request failed: ${res.status} ${errText}`);
      return null;
    }

    // Read SSE stream — accumulate all chunks
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }
    fullText += decoder.decode(); // flush remaining bytes

    // Parse SSE lines to find the final result value
    let resultContent = "";
    for (const line of fullText.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const event = JSON.parse(raw);
        const candidate = event.result ?? event.output ?? event.content ?? event.message;
        if (candidate) resultContent = String(candidate);
      } catch {
        if (raw) resultContent = raw; // plain text chunk
      }
    }

    if (!resultContent) resultContent = fullText;

    let parsed: Record<string, string> = {};
    try {
      const jsonMatch = String(resultContent).match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.warn("[TinyFish] Could not parse JSON from agent response");
    }

    return {
      company_overview: parsed.company_overview || `${companyName} — research data not available.`,
      recent_news: parsed.recent_news || "No recent news found.",
      engineering_culture: parsed.engineering_culture || "Engineering culture information not available.",
      interview_process: parsed.interview_process || "Interview process details not available.",
      common_questions: parsed.common_questions || "Common questions not available.",
      compensation: parsed.compensation || "Compensation data not available.",
      tips: parsed.tips || "No specific tips found.",
    };
  } catch (err: any) {
    console.error(`[TinyFish] Research failed: ${err.message}`);
    return null;
  }
}
