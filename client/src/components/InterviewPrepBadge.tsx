import { useState, useEffect, useRef } from "react";
import { InterviewPrep } from "../types";
import { fetchInterviewPrep, generatePrep } from "../api";

interface Props {
  jobId: number;
  onClick: () => void;
}

export default function InterviewPrepBadge({ jobId, onClick }: Props) {
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noneAttemptsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    function startPoll(intervalMs: number, maxNoneAttempts: number) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const updated = await fetchInterviewPrep(jobId);
          if (cancelled) return;
          setPrep(updated);
          if (updated.status === "none") {
            noneAttemptsRef.current++;
            if (noneAttemptsRef.current >= maxNoneAttempts) {
              // Row never appeared — give up
              clearInterval(pollRef.current!);
              pollRef.current = null;
            }
          } else if (updated.status !== "generating") {
            // completed or failed — stop polling
            clearInterval(pollRef.current!);
            pollRef.current = null;
          } else {
            // switched to generating — slow down poll
            noneAttemptsRef.current = 0;
            clearInterval(pollRef.current!);
            startPoll(5000, 0);
          }
        } catch { /* ignore poll errors */ }
      }, intervalMs);
    }

    async function load() {
      try {
        const data = await fetchInterviewPrep(jobId);
        if (!cancelled) setPrep(data);

        if (data.status === "generating") {
          startPoll(5000, 0);
        } else if (data.status === "none") {
          // Row may not exist yet — triggerPrepIfNew is fire-and-forget on the server.
          // Poll quickly for up to ~30s to catch the transition to "generating".
          noneAttemptsRef.current = 0;
          startPoll(3000, 10);
        }
      } catch { /* badge silently hides on error */ }
    }

    load();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!prep || prep.status === "none") {
      // Kick off generation and show spinner
      try {
        await generatePrep(jobId);
        setPrep({ status: "generating" });
        pollRef.current = setInterval(async () => {
          try {
            const updated = await fetchInterviewPrep(jobId);
            setPrep(updated);
            if (updated.status !== "generating") {
              clearInterval(pollRef.current!);
              pollRef.current = null;
            }
          } catch { /* ignore */ }
        }, 5000);
      } catch { /* ignore */ }
    } else if (prep.status === "completed") {
      onClick();
    } else if (prep.status === "failed") {
      // Retry
      try {
        await generatePrep(jobId);
        setPrep({ status: "generating" });
      } catch { /* ignore */ }
    }
  }

  if (!prep || prep.status === "none") return null;

  if (prep.status === "generating") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md"
        title="Generating interview prep materials..."
      >
        <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Preparing...
      </span>
    );
  }

  if (prep.status === "failed") {
    return (
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 px-2.5 py-1 rounded-md transition-colors"
        title={`Prep generation failed: ${prep.errorMessage || "unknown error"}. Click to retry.`}
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Prep ✗
      </button>
    );
  }

  // completed
  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md transition-colors"
      title="Interview prep materials ready — click to view"
    >
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Prep ✓
    </button>
  );
}
