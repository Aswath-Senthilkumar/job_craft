import { ScrapedJob } from "../../types";
import { politeGet } from "./utils";

/** HN Who's Hiring — scrapes the latest monthly thread via Algolia API */
export async function scrapeHNHiring(keywords: string[]): Promise<ScrapedJob[]> {
  try {
    // Get the latest "Who is hiring" post
    const threadRes = await politeGet(
      "https://hn.algolia.com/api/v1/search?tags=ask_hn&query=who+is+hiring&hitsPerPage=1"
    );
    if (!threadRes.ok) return [];
    const threadData: any = await threadRes.json();
    const threadId = threadData.hits?.[0]?.objectID;
    if (!threadId) return [];

    // Search comments in that thread for keywords
    const kwQuery = keywords.slice(0, 5).join(" ");
    const commentsRes = await politeGet(
      `https://hn.algolia.com/api/v1/search?tags=comment,story_${threadId}&query=${encodeURIComponent(kwQuery)}&hitsPerPage=50`
    );
    if (!commentsRes.ok) return [];
    const commentsData: any = await commentsRes.json();

    const jobs: ScrapedJob[] = [];
    for (const hit of commentsData.hits || []) {
      const text: string = hit.comment_text || "";
      if (!text) continue;
      const lower = text.toLowerCase();
      const kwMatch = keywords.some((kw) => lower.includes(kw.toLowerCase()));
      if (!kwMatch) continue;

      // Try to extract company | role | location from first line of HN comment
      const firstLine = text.replace(/<[^>]+>/g, "").split("\n")[0].trim();
      const parts = firstLine.split(/[|,·]/);
      const company = parts[0]?.trim() || "Company (HN)";
      const title = parts[1]?.trim() || keywords[0] || "Software Engineer";
      const location = parts[2]?.trim() || "";

      jobs.push({
        title,
        companyName: company,
        link: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        location,
        descriptionText: text.replace(/<[^>]+>/g, " ").trim().slice(0, 2000),
        postedAt: hit.created_at || undefined,
        source: "hn_hiring",
        externalId: hit.objectID,
      });
    }
    return jobs;
  } catch { return []; }
}
