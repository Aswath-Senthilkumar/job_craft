import { useState, useEffect, useRef, useCallback } from "react";
import {
  runPipeline, stopPipeline, getPipelineStatus,
  fetchSettings, fetchPoolProfile, fetchPoolExperiences, fetchPoolProjects, fetchPoolEducation,
} from "../api";

interface PipelineModalProps {
  visible: boolean;
  onClose: () => void;
}

interface LogEntry {
  type: "log" | "error" | "status" | "done";
  text: string;
  time: string;
}

interface ValidationState {
  profile: boolean;
  experience: boolean;
  project: boolean;
  education: boolean;
  keywords: boolean;
  countries: boolean;
  levels: boolean;
}

interface JobProgress {
  current: number;
  total: number;
}

const STEPS = [
  { id: 1, label: "Scraping",    desc: "Collecting jobs from all sources"       },
  { id: 2, label: "Filtering",   desc: "Location, freshness & seniority"         },
  { id: 3, label: "Scoring",     desc: "Matching jobs to your resume skills"     },
  { id: 4, label: "Processing",  desc: "AI tailoring resumes & generating PDFs"  },
];

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Rejection is not the opposite of success — it is part of it.", author: "" },
  { text: "Every expert was once a beginner who kept applying.", author: "" },
  { text: "It always seems impossible until it is done.", author: "Nelson Mandela" },
  { text: "The future belongs to those who prepare for it today.", author: "Malcolm X" },
  { text: "Your resume gets you in the door. Your story closes the deal.", author: "" },
  { text: "Don't watch the clock. Do what it does — keep going.", author: "Sam Levenson" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "Every career is built on a foundation of rejections and persistence.", author: "" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "The difference between a good candidate and a great one is preparation.", author: "" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "Keep going. Your breakthrough might be the next application away.", author: "" },
  { text: "Skills open doors. Attitude keeps you in the room.", author: "" },
  { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
  { text: "Dream big. Start small. Act now.", author: "" },
  { text: "Preparation plus opportunity equals luck. Create your own.", author: "" },
  { text: "Success usually comes to those too busy to be looking for it.", author: "Henry David Thoreau" },
  { text: "Every interview is practice. Every rejection is data.", author: "" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Your next opportunity is already out there. Go find it.", author: "" },
  { text: "Success is not final, failure is not fatal — it is the courage to continue.", author: "Winston Churchill" },
  { text: "Persistence guarantees that results are inevitable.", author: "Paramahansa Yogananda" },
  { text: "A ship in harbour is safe, but that is not what ships are for.", author: "John A. Shedd" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
];

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}

function formatRemaining(s: number): string {
  const remaining = Math.max(0, 900 - s);
  if (remaining === 0) return "almost done";
  const m = Math.floor(remaining / 60);
  if (m === 0) return "< 1 min left";
  return `~${m} min left`;
}

export default function PipelineModal({ visible, onClose }: PipelineModalProps) {
  // Validation
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [validationLoading, setValidationLoading] = useState(true);

  // Pipeline state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Progress
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [scrapedCount, setScrapedCount] = useState<number | null>(null);
  const [summaryLines, setSummaryLines] = useState<string[]>([]);
  const inSummaryRef = useRef(false);

  // Quote + timer
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // ── Validation on mount ────────────────────────────────────────────────────
  useEffect(() => {
    async function validate() {
      setValidationLoading(true);
      try {
        const [profile, experiences, projects, education, settings] = await Promise.all([
          fetchPoolProfile().catch(() => null),
          fetchPoolExperiences().catch(() => [] as any[]),
          fetchPoolProjects().catch(() => [] as any[]),
          fetchPoolEducation().catch(() => [] as any[]),
          fetchSettings().catch(() => null),
        ]);
        setValidation({
          profile: !!(profile?.name?.trim() && profile?.email?.trim()),
          experience: Array.isArray(experiences) && experiences.length >= 1,
          project: Array.isArray(projects) && projects.length >= 1,
          education: Array.isArray(education) && education.length >= 1,
          keywords: !!(settings?.config?.SEARCH_KEYWORDS?.trim()),
          countries: !!(settings?.config?.TARGET_COUNTRIES?.trim()),
          levels: !!(settings?.config?.JOB_LEVELS?.trim()),
        });
      } catch {
        setValidation(null);
      } finally {
        setValidationLoading(false);
      }
    }
    validate();
    getPipelineStatus().then(({ running: r }) => {
      if (r) { setRunning(true); setStep(1); setProgress(10); }
    }).catch(() => {});
  }, []);

  // ── Quote rotator ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setQuoteIndex(i => (i + 1) % QUOTES.length), 20000);
    return () => clearInterval(id);
  }, [running]);

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  // ── Auto-scroll logs ───────────────────────────────────────────────────────
  useEffect(() => {
    if (showLogs) logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, showLogs]);

  // ── Browser close warning while pipeline is running ────────────────────────
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running]);

  // ── Log parsing ────────────────────────────────────────────────────────────
  function parseLog(text: string) {
    const t = text;

    if (/>>> Scraping all job sources/i.test(t)) {
      setStep(1); setProgress(5); inSummaryRef.current = false;
    } else if (/>>> Filtering by country/i.test(t)) {
      setStep(2); setProgress(32); inSummaryRef.current = false;
    } else if (/>>> (Extracting resume skills|Scoring \d+ jobs locally)/i.test(t)) {
      setStep(3); setProgress(52); inSummaryRef.current = false;
    } else if (/>>> Processing \d+ relevant jobs/i.test(t)) {
      setStep(4); setProgress(65); inSummaryRef.current = false;
      const m = t.match(/Processing (\d+) relevant/i);
      if (m) setJobProgress({ current: 0, total: parseInt(m[1]) });
    } else if (/═══ Pipeline Summary/i.test(t)) {
      inSummaryRef.current = true; setProgress(100);
    }

    // Job [X/Y] progress
    const jobM = t.match(/\[(\d+)\/(\d+)\]/);
    if (jobM) {
      const cur = parseInt(jobM[1]), total = parseInt(jobM[2]);
      setJobProgress({ current: cur, total });
      setProgress(Math.min(95, 65 + Math.round((cur / total) * 30)));
    }

    // Scraped count
    const scrapedM = t.match(/Scrapers?: (\d+) unique/i);
    if (scrapedM) setScrapedCount(parseInt(scrapedM[1]));

    // Collect summary lines
    if (inSummaryRef.current && /^\s*(Scraped|Location|Relevant|Applied|Skipped|Errors):/.test(t)) {
      setSummaryLines(prev => [...prev, t.trim()]);
    }
  }

  const addLog = useCallback((type: string, data: string) => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs(prev => [...prev, { type: type as LogEntry["type"], text: data, time }]);
    parseLog(data);
  }, []);

  // ── Pipeline controls ──────────────────────────────────────────────────────
  function handleStart() {
    setLogs([]);
    setRunning(true);
    setFinished(false);
    setStep(0);
    setProgress(0);
    setJobProgress(null);
    setScrapedCount(null);
    setSummaryLines([]);
    inSummaryRef.current = false;
    setElapsed(0);
    startTimeRef.current = Date.now();

    const controller = runPipeline(
      addLog,
      () => { setRunning(false); setFinished(true); setProgress(100); },
      (err) => { addLog("error", err); setRunning(false); setFinished(true); },
    );
    controllerRef.current = controller;
  }

  function handleStop() {
    controllerRef.current?.abort();
    stopPipeline().catch(() => {});
    setRunning(false);
    setFinished(true);
    addLog("status", "Pipeline stopped by user");
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const canRun = !validationLoading && validation !== null && Object.values(validation).every(Boolean);
  const validationItems = validation ? [
    { key: "profile",    ok: validation.profile,    label: "Personal info",     hint: "Name and email required in Resume Pool → Profile" },
    { key: "experience", ok: validation.experience, label: "Work experience",   hint: "Add at least 1 experience in Resume Pool → Work Experience" },
    { key: "project",    ok: validation.project,    label: "Project",           hint: "Add at least 1 project in Resume Pool → Projects" },
    { key: "education",  ok: validation.education,  label: "Education",         hint: "Add at least 1 education entry in Resume Pool → Education" },
    { key: "keywords",   ok: validation.keywords,   label: "Search keywords",   hint: "Set job titles to search in Settings → Pipeline → Search Keywords" },
    { key: "countries",  ok: validation.countries,  label: "Target countries",  hint: "Set target locations in Settings → Pipeline → Target Countries" },
    { key: "levels",     ok: validation.levels,     label: "Job levels",        hint: "Set seniority levels in Settings → Pipeline → Job Levels" },
  ] : [];

  const quote = QUOTES[quoteIndex];

  // ── Log color helpers ──────────────────────────────────────────────────────
  function getLogColor(type: string, text: string): string {
    if (type === "error") return "text-red-400";
    if (type === "done") return "text-emerald-400 font-medium";
    if (text.includes("✓")) return "text-emerald-400";
    if (text.includes("⚠")) return "text-amber-400";
    if (text.includes("✗")) return "text-red-400";
    if (text.includes(">>>")) return "text-cyan-400 font-medium";
    if (text.includes("[") && /\[\d+\/\d+\]/.test(text)) return "text-blue-300 font-medium";
    return "text-gray-400";
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="bg-[#0d0f13] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col"
        style={{ maxHeight: "88vh" }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              running ? "bg-emerald-400 animate-pulse" : finished ? "bg-blue-400" : "bg-gray-600"
            }`} />
            <h2 className="text-base font-semibold text-gray-100">Job Pipeline</h2>
            {running && (
              <span className="text-xs text-emerald-400/70 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                Running · {formatElapsed(elapsed)}
              </span>
            )}
            {finished && !running && (
              <span className="text-xs text-blue-400/70 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                Finished · {formatElapsed(elapsed)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {running && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-600/30 text-red-400 font-medium transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                Stop
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1.5 rounded-lg hover:bg-gray-800/50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Browser close warning banner ────────────────────────────────── */}
        {running && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-amber-500/8 border-b border-amber-500/20 shrink-0">
            <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs text-amber-400/90">
              <span className="font-semibold">Don't close this browser tab</span> — the pipeline will stop if you do. You can safely close this panel.
            </p>
          </div>
        )}

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* ── Progress area (running or finished) ─────────────────────── */}
          {(running || finished) && (
            <div className="px-6 pt-5 pb-4 space-y-5">

              {/* Overall progress bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 font-medium">
                    {progress < 100 ? "In progress" : "Complete"}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {running ? formatRemaining(elapsed) : "Done"}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      progress >= 100
                        ? "bg-emerald-500"
                        : "bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-600">0</span>
                  <span className="text-xs text-gray-600">est. 15 min</span>
                </div>
              </div>

              {/* Step tracker */}
              <div className="flex items-start gap-0">
                {STEPS.map((s, idx) => {
                  const isActive = step === s.id && running;
                  const isDone = step > s.id || (!running && finished && step >= s.id) || progress === 100;
                  const isPending = step < s.id && running;
                  return (
                    <div key={s.id} className="flex-1 flex flex-col items-center">
                      <div className="flex items-center w-full">
                        {/* Connector left */}
                        <div className={`flex-1 h-px ${idx === 0 ? "opacity-0" : isDone ? "bg-emerald-500/60" : "bg-gray-700"}`} />
                        {/* Node */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border text-xs font-bold transition-all ${
                          isDone
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                            : isActive
                              ? "bg-blue-500/20 border-blue-500/60 text-blue-300 ring-2 ring-blue-500/20"
                              : "bg-gray-800/60 border-gray-700/50 text-gray-600"
                        }`}>
                          {isDone
                            ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            : isActive
                              ? <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse block" />
                              : s.id
                          }
                        </div>
                        {/* Connector right */}
                        <div className={`flex-1 h-px ${idx === STEPS.length - 1 ? "opacity-0" : isDone ? "bg-emerald-500/60" : "bg-gray-700"}`} />
                      </div>
                      <div className="mt-2 text-center px-1">
                        <p className={`text-xs font-medium ${isDone ? "text-emerald-400" : isActive ? "text-blue-300" : "text-gray-600"}`}>
                          {s.label}
                        </p>
                        {isActive && (
                          <p className="text-xs text-gray-600 mt-0.5 leading-tight">{s.desc}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Job sub-progress (step 4) */}
              {step === 4 && jobProgress && jobProgress.total > 0 && (
                <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">Processing jobs</span>
                    <span className="text-xs text-gray-400 tabular-nums font-medium">
                      {jobProgress.current} / {jobProgress.total}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all duration-500"
                      style={{ width: `${(jobProgress.current / jobProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1.5">Each job takes ~2–3 min for AI tailoring and PDF generation</p>
                </div>
              )}

              {/* Scraped count callout */}
              {scrapedCount !== null && (
                <div className="flex items-center gap-2.5 bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-sm text-blue-300 font-medium">
                    {scrapedCount.toLocaleString()} jobs scraped from all sources
                  </span>
                </div>
              )}

              {/* Summary stats (after done) */}
              {finished && summaryLines.length > 0 && (
                <div className="bg-emerald-500/6 border border-emerald-500/20 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-emerald-400 mb-2">Pipeline Summary</p>
                  {summaryLines.map((line, i) => (
                    <p key={i} className="text-xs text-gray-400 font-mono">{line}</p>
                  ))}
                </div>
              )}

              {/* Quote rotator */}
              {running && (
                <div className="border-t border-gray-800/60 pt-4">
                  <div key={quoteIndex} className="text-center px-4 transition-opacity duration-500">
                    <p className="text-sm text-gray-400 italic leading-relaxed">"{quote.text}"</p>
                    {quote.author && (
                      <p className="text-xs text-gray-600 mt-1.5">— {quote.author}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Pre-flight checklist (idle) ──────────────────────────────── */}
          {!running && !finished && (
            <div className="px-6 pt-5 pb-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-300 mb-1">Pre-flight checklist</p>
                <p className="text-xs text-gray-500">All items must be complete before the pipeline can run.</p>
              </div>

              {validationLoading ? (
                <div className="flex items-center gap-2 py-4">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-gray-500">Checking your setup...</span>
                </div>
              ) : validation === null ? (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  Could not reach server to validate setup. Make sure the server is running.
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Resume Pool section */}
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wide pt-1 pb-0.5">Resume Pool</p>
                  {validationItems.slice(0, 4).map(item => (
                    <div key={item.key} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg ${item.ok ? "bg-transparent" : "bg-red-500/5 border border-red-500/15"}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${item.ok ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                        {item.ok
                          ? <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          : <svg className="w-2.5 h-2.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        }
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-medium ${item.ok ? "text-gray-300" : "text-red-400"}`}>{item.label}</p>
                        {!item.ok && <p className="text-xs text-gray-500 mt-0.5">{item.hint}</p>}
                      </div>
                    </div>
                  ))}

                  {/* Pipeline Settings section */}
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wide pt-3 pb-0.5">Pipeline Settings</p>
                  {validationItems.slice(4).map(item => (
                    <div key={item.key} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg ${item.ok ? "bg-transparent" : "bg-red-500/5 border border-red-500/15"}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${item.ok ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                        {item.ok
                          ? <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          : <svg className="w-2.5 h-2.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        }
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-medium ${item.ok ? "text-gray-300" : "text-red-400"}`}>{item.label}</p>
                        {!item.ok && <p className="text-xs text-gray-500 mt-0.5">{item.hint}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pipeline description */}
              <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-gray-400">What the pipeline does</p>
                <div className="space-y-1.5">
                  {STEPS.map(s => (
                    <div key={s.id} className="flex items-center gap-2.5">
                      <span className="text-xs text-gray-600 w-3 tabular-nums">{s.id}.</span>
                      <span className="text-xs font-medium text-gray-400">{s.label}</span>
                      <span className="text-xs text-gray-600">— {s.desc}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 pt-1 border-t border-gray-700/40">
                  Estimated time: up to 15 minutes depending on job count and AI processing.
                </p>
              </div>
            </div>
          )}

          {/* ── Collapsible logs ─────────────────────────────────────────── */}
          {(running || finished) && logs.length > 0 && (
            <div className="px-6 pb-4">
              <button
                onClick={() => setShowLogs(v => !v)}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-2"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${showLogs ? "rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {showLogs ? "Hide" : "View"} raw logs ({logs.length})
              </button>
              {showLogs && (
                <div className="bg-[#07080a] border border-gray-800/60 rounded-xl px-4 py-3 font-mono text-xs leading-relaxed max-h-56 overflow-y-auto">
                  {logs.map((entry, i) => (
                    <div key={i} className={`py-0.5 ${getLogColor(entry.type, entry.text)}`}>
                      <span className="text-gray-700 select-none mr-2">{entry.time}</span>
                      {entry.text}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-3.5 border-t border-gray-800 shrink-0 flex items-center justify-between">
          <span className="text-xs text-gray-600">
            {!running && !finished && !canRun && !validationLoading
              ? "Fix the items above to enable the pipeline"
              : running
                ? "Pipeline is running — you can close this panel"
                : finished
                  ? "Pipeline complete"
                  : "Ready to run"
            }
          </span>
          <div className="flex items-center gap-2">
            {!running && !finished && (
              <button
                onClick={handleStart}
                disabled={!canRun}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Run Pipeline
              </button>
            )}
            {finished && !running && (
              <button
                onClick={handleStart}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Run Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
