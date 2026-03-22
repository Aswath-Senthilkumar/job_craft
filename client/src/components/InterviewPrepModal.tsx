import { useState, useEffect, useRef } from "react";
import { InterviewPrep } from "../types";
import { fetchInterviewPrep, regeneratePrep, getPrepViewUrl } from "../api";

const TINYFISH_PHASE_S = 8 * 60; // 8 min → 0%→50%
const SYNTHESIS_PHASE_S = 3 * 60; // ~3 min → 50%→95%

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

interface Props {
  jobId: number;
  jobTitle: string;
  companyName: string;
  onClose: () => void;
}

function MarkdownViewer({ content }: { content: string }) {
  return (
    <div className="p-5 bg-[#0a0c10] rounded-xl border border-gray-800/50 max-h-[60vh] overflow-y-auto">
      <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed font-mono">{content}</pre>
    </div>
  );
}

export default function InterviewPrepModal({ jobId, jobTitle, companyName, onClose }: Props) {
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDoc, setActiveDoc] = useState<"intel" | "prep">("intel");
  const [regenerating, setRegenerating] = useState(false);
  const [pollStuck, setPollStuck] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollErrorsRef = useRef(0);
  const createdAtRef = useRef<string | null>(null);
  const statusRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchInterviewPrep(jobId);
        if (!cancelled) { setPrep(data); setLoading(false); }

        if (data.status === "generating") {
          pollErrorsRef.current = 0;
          pollRef.current = setInterval(async () => {
            try {
              const updated = await fetchInterviewPrep(jobId);
              pollErrorsRef.current = 0;
              if (!cancelled) { setPrep(updated); setPollStuck(false); }
              if (updated.status !== "generating") {
                clearInterval(pollRef.current!);
                pollRef.current = null;
              }
            } catch {
              pollErrorsRef.current += 1;
              if (pollErrorsRef.current >= 3 && !cancelled) setPollStuck(true);
            }
          }, 5000);
        }
      } catch {
        if (!cancelled) { setPrep({ status: "none" }); setLoading(false); }
      }
    }

    load();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  // Progress bar + elapsed timer — phase derived from elapsed time (no extra DB status needed)
  useEffect(() => {
    if (!prep) return;

    if (prep.createdAt) createdAtRef.current = prep.createdAt;
    statusRef.current = prep.status;

    if (prep.status !== "generating") {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (prep.status === "completed") setProgress(100);
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const startMs = createdAtRef.current
        ? new Date(createdAtRef.current).getTime()
        : Date.now();
      const totalElapsedS = Math.floor((Date.now() - startMs) / 1000);
      setElapsed(totalElapsedS);

      if (totalElapsedS < TINYFISH_PHASE_S) {
        // Phase 1: research — 0% → 50% over 8 min
        setProgress(Math.min(49, (totalElapsedS / TINYFISH_PHASE_S) * 50));
      } else {
        // Phase 2: synthesis — 50% → 94% over next 3 min
        const synthElapsedS = totalElapsedS - TINYFISH_PHASE_S;
        setProgress(50 + Math.min(44, (synthElapsedS / SYNTHESIS_PHASE_S) * 45));
      }
    }, 1000);

    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [prep?.status, prep?.createdAt]);

  async function handleRegenerate() {
    setRegenerating(true);
    createdAtRef.current = null;
    setProgress(0);
    setElapsed(0);
    try {
      await regeneratePrep(jobId);
      setPrep({ status: "generating" });
      setPollStuck(false);
      pollErrorsRef.current = 0;
      pollRef.current = setInterval(async () => {
        try {
          const updated = await fetchInterviewPrep(jobId);
          pollErrorsRef.current = 0;
          setPrep(updated);
          setPollStuck(false);
          if (updated.status !== "generating") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setRegenerating(false);
          }
        } catch {
          pollErrorsRef.current += 1;
          if (pollErrorsRef.current >= 3) setPollStuck(true);
        }
      }, 5000);
    } catch {
      setRegenerating(false);
    }
  }

  const getFilename = (url: string) => decodeURIComponent(url).split("/").pop() || "";

  return (
    <div className="fixed inset-0 bg-black/70 modal-backdrop flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#0d0f13] border border-gray-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 border-b border-gray-800/50 bg-gradient-to-b from-amber-500/5 to-transparent">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="pr-10">
            <p className="text-[11px] font-semibold text-amber-400/70 uppercase tracking-wider mb-1">Interview Prep</p>
            <h2 className="text-xl font-bold text-gray-50">{jobTitle}</h2>
            <p className="text-amber-400 text-sm font-medium mt-0.5">{companyName}</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <svg className="w-6 h-6 animate-spin mr-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </div>
          )}

          {!loading && (prep?.status === "none" || !prep) && (
            <div className="text-center py-12">
              <p className="text-gray-400 mb-4">No prep materials yet.</p>
              <p className="text-sm text-gray-600">Move this job to Interviewing to auto-generate materials, or click Regenerate below.</p>
            </div>
          )}

          {!loading && prep?.status === "generating" && (() => {
            const isSynthesizing = elapsed >= TINYFISH_PHASE_S;
            const phase = isSynthesizing ? "Synthesising documents" : "Researching company";
            const phaseDetail = isSynthesizing
              ? "Claude is writing your intel report and prep guide"
              : `Tinyfish agent is browsing the web for ${companyName}`;
            const barColor = isSynthesizing
              ? "from-violet-500 to-emerald-500"
              : "from-amber-500 to-orange-500";

            return (
              <div className="py-8 space-y-6">
                {/* Phase header */}
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-3">
                    <svg className="w-3 h-3 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                      {phase}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{phaseDetail}</p>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>{Math.round(progress)}%</span>
                    <span className="tabular-nums">{fmtElapsed(elapsed)} elapsed</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-1000 ease-linear`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {/* Phase markers */}
                  <div className="flex justify-between text-[10px] text-gray-600 mt-1 relative">
                    <span className="text-amber-500/70">Research</span>
                    <span
                      className={`absolute left-1/2 -translate-x-1/2 ${isSynthesizing ? "text-violet-400/70" : "text-gray-600"}`}
                    >
                      Synthesise
                    </span>
                    <span>Done</span>
                  </div>
                  {/* Phase track dots */}
                  <div className="flex items-center gap-0 mt-0.5">
                    <div className="h-0.5 flex-1 bg-amber-500/40 rounded-l-full" />
                    <div className={`w-2 h-2 rounded-full border-2 ${isSynthesizing ? "bg-violet-400 border-violet-400" : "bg-amber-400 border-amber-400 animate-pulse"}`} />
                    <div className={`h-0.5 flex-1 ${isSynthesizing ? "bg-violet-500/40" : "bg-gray-700"}`} />
                    <div className="w-2 h-2 rounded-full border-2 border-gray-700 bg-gray-800" />
                    <div className="h-0.5 flex-1 bg-gray-700 rounded-r-full" />
                  </div>
                </div>

                {/* Est time */}
                <p className="text-center text-xs text-gray-600">
                  Est. total time: up to 15 minutes
                </p>

                {pollStuck && (
                  <p className="text-center text-xs text-amber-500/70">Auto-refresh lost connection.</p>
                )}
                <div className="text-center">
                  <button
                    onClick={async () => {
                      try {
                        const updated = await fetchInterviewPrep(jobId);
                        setPrep(updated);
                        setPollStuck(false);
                        pollErrorsRef.current = 0;
                      } catch { /* ignore */ }
                    }}
                    className="text-xs text-gray-600 hover:text-gray-400 underline underline-offset-2 transition-colors"
                  >
                    Check status now
                  </button>
                </div>
              </div>
            );
          })()}

          {!loading && prep?.status === "failed" && (
            <div className="text-center py-8">
              <p className="text-red-400 font-medium mb-2">Generation failed</p>
              <p className="text-sm text-gray-500 mb-4">{prep.errorMessage || "Unknown error"}</p>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="text-sm font-medium bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Retry Generation
              </button>
            </div>
          )}

          {!loading && prep?.status === "completed" && (
            <>
              {/* Tab switcher */}
              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => setActiveDoc("intel")}
                  className={`flex-1 py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                    activeDoc === "intel"
                      ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                      : "bg-transparent border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Intel Report
                  </div>
                  <p className="text-[10px] text-current opacity-60 mt-0.5">Company · Process · Questions</p>
                </button>
                <button
                  onClick={() => setActiveDoc("prep")}
                  className={`flex-1 py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                    activeDoc === "prep"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-transparent border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Prep Guide
                  </div>
                  <p className="text-[10px] text-current opacity-60 mt-0.5">STAR stories · Skills · Pitch</p>
                </button>
              </div>

              {/* Document panel */}
              {activeDoc === "intel" && (
                <div>
                  {prep.intelReportUrl ? (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">Company overview, interview process, common questions, compensation, tips from past candidates.</p>
                      <a
                        href={getPrepViewUrl(getFilename(prep.intelReportUrl))}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/25 rounded-xl text-indigo-300 text-sm font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        View Intel Report PDF
                      </a>
                    </div>
                  ) : prep.intelMarkdown ? (
                    <div className="space-y-3">
                      <p className="text-xs text-amber-400/70">PDF unavailable — showing inline view</p>
                      <MarkdownViewer content={prep.intelMarkdown} />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 py-4 text-center">Intel report not available</p>
                  )}
                </div>
              )}

              {activeDoc === "prep" && (
                <div>
                  {prep.prepGuideUrl ? (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">Personalised STAR stories, skills gap analysis, topics to review, questions to ask, elevator pitch.</p>
                      <a
                        href={getPrepViewUrl(getFilename(prep.prepGuideUrl))}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/25 rounded-xl text-emerald-300 text-sm font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        View Prep Guide PDF
                      </a>
                    </div>
                  ) : prep.prepMarkdown ? (
                    <div className="space-y-3">
                      <p className="text-xs text-amber-400/70">PDF unavailable — showing inline view</p>
                      <MarkdownViewer content={prep.prepMarkdown} />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 py-4 text-center">Prep guide not available</p>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-800/50">
                <p className="text-xs text-gray-600">
                  {prep.updatedAt
                    ? `Generated ${new Date(prep.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                    : ""}
                </p>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 bg-gray-800/60 hover:bg-gray-700/60 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <svg className={`w-3 h-3 ${regenerating ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {regenerating ? "Regenerating..." : "Regenerate"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
