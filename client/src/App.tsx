import { useState, useEffect, useCallback } from "react";
import { Job, JobStatus, COLUMNS } from "./types";
import { fetchJobs, updateJobStatus, batchDeleteJobs, gmailStatus, gmailAuth, gmailSync, gmailDisconnect } from "./api";
import { useAuth } from "./hooks/useAuth";
import AuthPage from "./components/AuthPage";
import KanbanBoard from "./components/KanbanBoard";
import JobDetailModal from "./components/JobDetailModal";
import AddJobModal from "./components/AddJobModal";
import SkillsTrendModal from "./components/SkillsTrendModal";
import CareerEventsModal from "./components/CareerEventsModal";
import SettingsModal from "./components/SettingsModal";
import PipelineModal from "./components/PipelineModal";

interface ConfirmDialog {
  title: string;
  message: string;
  onConfirm: () => void;
}

export default function App() {
  const { user, loading: authLoading, error: authError, needsVerification, login, signup, verifyEmail, resendVerification, logout, clearError } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sortByScore, setSortByScore] = useState(false);
  const [sortByDeadline, setSortByDeadline] = useState(true);
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [showAddJob, setShowAddJob] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [gmailLastSync, setGmailLastSync] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const data = await fetchJobs();
      setJobs(data);
      setError(null);
    } catch {
      setError("Failed to load jobs. Is the server running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setJobs([]);
      setLoading(true);
      return;
    }
    loadJobs();
    const interval = setInterval(loadJobs, 30000);
    return () => clearInterval(interval);
  }, [loadJobs, user]);

  useEffect(() => {
    if (!user) return;
    gmailStatus().then((s) => { setGmailConnected(s.connected); setGmailLastSync(s.lastSync); }).catch(() => {});

    // Handle redirect back from OAuth popup (?gmail=connected)
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      window.history.replaceState({}, "", window.location.pathname);
      gmailStatus().then((s) => { setGmailConnected(s.connected); setGmailLastSync(s.lastSync); }).catch(() => {});
    }

    // Listen for postMessage from popup (works if opener is still accessible)
    const messageHandler = (e: MessageEvent) => {
      if (e.data === "gmail_connected") {
        gmailStatus().then((s) => { setGmailConnected(s.connected); setGmailLastSync(s.lastSync); }).catch(() => {});
      }
    };
    window.addEventListener("message", messageHandler);
    return () => window.removeEventListener("message", messageHandler);
  }, [user]);

  // Filter by search query
  const searched = jobs.filter((j) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !j.job_title.toLowerCase().includes(q) &&
        !j.company_name.toLowerCase().includes(q) &&
        !(j.location || "").toLowerCase().includes(q)
      ) return false;
    }
    if (sourceFilter) {
      const srcs: string[] = j.sources
        ? (() => { try { return JSON.parse(j.sources); } catch { return [j.source]; } })()
        : [j.source];
      if (!srcs.some((s) => s === sourceFilter)) return false;
    }
    // Location filter
    if (locationFilter) {
      const loc = (j.location || "").toLowerCase();
      if (locationFilter === "remote") {
        if (!/remote|hybrid/i.test(loc)) return false;
      } else {
        if (!loc.includes(locationFilter.toLowerCase())) return false;
      }
    }
    return true;
  });

  // Sort logic
  const filteredJobs = (() => {
    if (sortByScore) {
      return [...searched].sort((a, b) => {
        const sa = a.match_score ?? -1;
        const sb = b.match_score ?? -1;
        return sb - sa;
      });
    }
    if (sortByDeadline) {
      return [...searched].sort((a, b) => {
        // both have deadline — closest first
        if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        // one has deadline — it goes first
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        // neither has deadline — fall back to applied_date desc (most recent first)
        const da = a.applied_date || a.created_at;
        const db2 = b.applied_date || b.created_at;
        return new Date(db2).getTime() - new Date(da).getTime();
      });
    }
    return searched;
  })();

  async function handleDragEnd(jobId: number, newStatus: JobStatus) {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
    );
    try {
      await updateJobStatus(jobId, newStatus);
    } catch {
      loadJobs();
    }
  }

  function handleJobUpdate(updated: Job) {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    setSelectedJob(updated);
  }

  function handleJobDelete(id: number) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setSelectedJob(null);
  }

  function handleToggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAllInColumn(status: JobStatus) {
    const columnJobIds = filteredJobs.filter((j) => j.status === status).map((j) => j.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = columnJobIds.every((id) => next.has(id));
      if (allSelected) {
        // Deselect all in this column
        columnJobIds.forEach((id) => next.delete(id));
      } else {
        // Select all in this column
        columnJobIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    setConfirmDialog({ title, message, onConfirm });
  }

  async function executeBatchDelete(ids: number[]) {
    try {
      await batchDeleteJobs(ids);
      setJobs((prev) => prev.filter((j) => !ids.includes(j.id)));
      exitSelectionMode();
    } catch {
      setError("Failed to delete jobs. Try again.");
    }
  }

  function handleDeleteSelected() {
    const ids = Array.from(selectedIds);
    showConfirm(
      "Delete selected jobs",
      `Delete ${ids.length} selected job${ids.length > 1 ? "s" : ""}? This cannot be undone.`,
      () => executeBatchDelete(ids)
    );
  }

  function handleDeleteColumn(status: JobStatus, count: number) {
    const col = COLUMNS.find((c) => c.id === status);
    const ids = jobs.filter((j) => j.status === status).map((j) => j.id);
    showConfirm(
      `Clear ${col?.title} column`,
      `Delete all ${count} job${count > 1 ? "s" : ""} in ${col?.emoji} ${col?.title}? This cannot be undone.`,
      () => executeBatchDelete(ids)
    );
  }

  function handleAddJob(job: Job) {
    setJobs((prev) => [job, ...prev]);
  }

  async function handleGmailConnect() {
    try {
      const { url } = await gmailAuth();
      window.open(url, "_blank", "width=500,height=650");

      // Poll every 1.5s for up to 60s — covers slow OAuth flows
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        gmailStatus().then((s) => {
          if (s.connected) {
            setGmailConnected(true);
            setGmailLastSync(s.lastSync);
            clearInterval(poll);
          }
        }).catch(() => {});
        if (attempts >= 40) clearInterval(poll); // give up after 60s
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleGmailDisconnect() {
    try {
      await gmailDisconnect();
      setGmailConnected(false);
      setGmailLastSync(null);
    } catch (err: any) {
      setError("Failed to disconnect Gmail: " + err.message);
    }
  }

  async function handleGmailSync() {
    setGmailSyncing(true);
    try {
      const result = await gmailSync();
      await loadJobs(); // Always refresh
      gmailStatus().then((s) => { setGmailConnected(s.connected); setGmailLastSync(s.lastSync); }).catch(() => {});
      if (result.synced > 0) {
        const created = result.updates?.filter((u: any) => u.created).length ?? 0;
        const updated = result.synced - created;
        const parts = [];
        if (created > 0) parts.push(`${created} new job${created > 1 ? "s" : ""} added`);
        if (updated > 0) parts.push(`${updated} updated`);
        setError("✓ Gmail sync: " + parts.join(", ") + ` (${result.scanned} emails scanned)`);
        setTimeout(() => setError(null), 6000);
      } else {
        setError("✓ Gmail sync: no new changes (" + result.scanned + " emails scanned)");
        setTimeout(() => setError(null), 4000);
      }
    } catch (err: any) {
      setError("Gmail sync failed: " + err.message);
    } finally {
      setGmailSyncing(false);
    }
  }

  // Stats
  const stats = COLUMNS.map((col) => ({
    ...col,
    count: jobs.filter((j) => j.status === col.id).length,
  }));

  const totalApplied = jobs.filter((j) => ["applied", "interviewing", "offer", "rejected"].includes(j.status)).length;
  const interviewRate = totalApplied > 0 ? Math.round((jobs.filter((j) => ["interviewing", "offer"].includes(j.status)).length / totalApplied) * 100) : 0;
  const offerRate = totalApplied > 0 ? Math.round((jobs.filter((j) => j.status === "offer").length / totalApplied) * 100) : 0;
  const rejectionRate = totalApplied > 0 ? Math.round((jobs.filter((j) => j.status === "rejected").length / totalApplied) * 100) : 0;

  // Auth loading screen
  if (authLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#07080a] gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Checking authentication...</p>
      </div>
    );
  }

  // Not authenticated — show login/signup page
  if (!user) {
    return <AuthPage onLogin={login} onSignup={signup} onVerify={verifyEmail} onResend={resendVerification} needsVerification={needsVerification} error={authError} clearError={clearError} />;
  }

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#07080a] gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Loading your jobs...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#07080a] overflow-hidden">
      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d0f13] border border-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-gray-50 mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-gray-400 mb-5">{confirmDialog.message}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header — single compact bar */}
      <header className="shrink-0 px-5 py-3.5 border-b border-gray-800/50 flex items-center gap-3.5 flex-wrap">
        {/* Title */}
        <h1 className="text-xl font-bold text-gray-50 tracking-tight shrink-0">Job Tracker</h1>

        {/* Search */}
        <div className="relative shrink-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-52 bg-[#0f1115] border border-gray-800/60 rounded-lg pl-9 pr-3 py-2.5 text-base text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Sort by deadline */}
        <button
          onClick={() => { setSortByDeadline((v) => !v); setSortByScore(false); }}
          className={`flex items-center gap-1.5 text-base px-4 py-2.5 rounded-lg border transition-all font-medium shrink-0 ${
            sortByDeadline
              ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
              : "bg-transparent border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Deadline
        </button>

        {/* Sort by score */}
        <button
          onClick={() => { setSortByScore((v) => !v); setSortByDeadline(false); }}
          className={`flex items-center gap-1.5 text-base px-4 py-2.5 rounded-lg border transition-all font-medium shrink-0 ${
            sortByScore
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
              : "bg-transparent border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
          </svg>
          Score
        </button>

        {/* Location filter dropdown */}
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className={`bg-[#0f1115] border rounded-lg px-4 py-2.5 text-base focus:outline-none focus:border-blue-500/40 shrink-0 cursor-pointer ${
            locationFilter
              ? "border-blue-500/30 text-blue-400"
              : "border-gray-800/60 text-gray-400"
          }`}
          title="Filter by location"
        >
          <option value="">All locations</option>
          <option value="united states">United States</option>
          <option value="india">India</option>
          <option value="remote">Remote / Hybrid</option>
        </select>

        {/* Source filter */}
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="bg-[#0f1115] border border-gray-800/60 rounded-lg px-4 py-2.5 text-base text-gray-400 focus:outline-none focus:border-blue-500/40 shrink-0 cursor-pointer"
          title="Filter by source"
        >
          <option value="">All sources</option>
          <option value="linkedin">LinkedIn</option>
          <option value="remoteok">RemoteOK</option>
          <option value="jobicy">Jobicy</option>
          <option value="arbeitnow">Arbeitnow</option>
          <option value="remotive">Remotive</option>
          <option value="hn_hiring">HN Hiring</option>
          <option value="weworkremotely">WWR</option>
          <option value="devto">dev.to</option>
          <option value="careerjet">CareerJet</option>
          <option value="indeed">Indeed</option>
          <option value="glassdoor">Glassdoor</option>
          <option value="ashby">Ashby</option>
          <option value="lever">Lever</option>
          <option value="greenhouse">Greenhouse</option>
          <option value="simplify">Simplify</option>
          <option value="naukri">Naukri</option>
        </select>

        {/* Skills trend button */}
        <button
          onClick={() => setShowSkills(true)}
          className="flex items-center gap-1 text-base px-4 py-2.5 rounded-lg border border-gray-800 text-gray-500 hover:border-indigo-700/50 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all font-medium shrink-0"
          title="View in-demand skills from your job descriptions"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Skills
        </button>

        {/* Career events button */}
        <button
          onClick={() => setShowEvents(true)}
          className="flex items-center gap-1 text-base px-4 py-2.5 rounded-lg border border-gray-800 text-gray-500 hover:border-emerald-700/50 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all font-medium shrink-0"
          title="Career fairs & events"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Events
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-800 shrink-0" />

        {/* Stats inline */}
        <div className="flex items-center gap-0.5 shrink-0">
          {stats.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-800/40 transition-colors"
              title={s.title}
            >
              <span className={`text-lg font-bold tabular-nums ${s.count > 0 ? "text-gray-200" : "text-gray-700"}`}>{s.count}</span>
              <span className="text-base text-gray-500">{s.emoji} {s.title}</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-800 shrink-0" />

        {/* Rate badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-base text-gray-500 bg-gray-800/40 px-3 py-1.5 rounded-lg" title="Interview rate">
            📞 {interviewRate}% interviews
          </span>
          <span className="text-base text-emerald-500/70 bg-emerald-500/8 px-3 py-1.5 rounded-lg" title="Offer rate">
            🎉 {offerRate}% offers
          </span>
          <span className="text-base text-red-500/70 bg-red-500/8 px-3 py-1.5 rounded-lg" title="Rejection rate">
            ❌ {rejectionRate}% rejections
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-800 shrink-0" />

        {/* Run Pipeline button */}
        <button
          onClick={() => setShowPipeline(true)}
          className="flex items-center gap-1.5 text-base px-4 py-2.5 rounded-lg border border-cyan-700/50 bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600/20 hover:border-cyan-600/60 transition-all font-medium shrink-0"
          title="Run job scraping and resume tailoring pipeline"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Pipeline
        </button>

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1 text-base px-4 py-2.5 rounded-lg border border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300 hover:bg-gray-800/30 transition-all font-medium shrink-0"
          title="Pipeline settings, resume upload"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>

        {/* Add Job button */}
        <button
          onClick={() => setShowAddJob(true)}
          className="flex items-center gap-1 text-base px-4 py-2.5 rounded-lg border border-emerald-700/50 bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25 transition-all font-medium shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Job
        </button>

        {/* Gmail */}
        {gmailConnected ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleGmailSync}
              disabled={gmailSyncing}
              className="flex items-center gap-1.5 text-base px-4 py-2.5 rounded-lg border border-emerald-700/40 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 transition-all font-medium disabled:opacity-50"
              title={gmailLastSync ? `Last sync: ${new Date(gmailLastSync).toLocaleString()}` : "Sync Gmail now"}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              {gmailSyncing ? "Syncing..." : "Sync Gmail"}
            </button>
            <button
              onClick={handleGmailDisconnect}
              className="text-base px-4 py-2.5 rounded-lg border border-gray-800 text-gray-600 hover:border-red-800/50 hover:text-red-400 hover:bg-red-500/5 transition-all font-medium"
              title="Disconnect Gmail"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={handleGmailConnect}
            className="flex items-center gap-1.5 text-base px-4 py-2.5 rounded-lg border border-gray-700 bg-transparent text-gray-500 hover:border-blue-700/50 hover:text-blue-400 hover:bg-blue-500/5 transition-all font-medium shrink-0"
          >
            <span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />
            Connect Gmail
          </button>
        )}

        {/* Divider */}
        <div className="w-px h-5 bg-gray-800 shrink-0" />

        {/* Selection mode */}
        {!selectionMode ? (
          <button
            onClick={() => setSelectionMode(true)}
            className="flex items-center gap-1 text-base px-4 py-2.5 rounded-lg border border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300 transition-all font-medium shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Select
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-base text-gray-400 font-medium">{selectedIds.size} selected</span>
            {selectedIds.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete {selectedIds.size}
              </button>
            )}
            <button
              onClick={exitSelectionMode}
              className="text-base px-4 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User + Logout */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-gray-500 truncate max-w-[160px]" title={user.email}>
            {user.profile?.name || user.email}
          </span>
          <button
            onClick={logout}
            className="text-sm px-3 py-2 rounded-lg border border-gray-800 text-gray-500 hover:border-red-800/50 hover:text-red-400 hover:bg-red-500/5 transition-all"
            title="Sign out"
          >
            Sign Out
          </button>
        </div>
      </header>

      {error && (
        <div className={`mx-5 mb-2 p-3 rounded-xl text-xs flex items-center gap-2 ${
          error.startsWith("✓")
            ? "bg-emerald-500/8 border border-emerald-500/20 text-emerald-400"
            : "bg-red-500/8 border border-red-500/20 text-red-400"
        }`}>
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {error.startsWith("✓")
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            }
          </svg>
          {error}
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 min-h-0">
        <KanbanBoard
          jobs={filteredJobs}
          onDragEnd={handleDragEnd}
          onCardClick={selectionMode ? () => {} : setSelectedJob}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onDeleteColumn={handleDeleteColumn}
          onSelectAllInColumn={handleSelectAllInColumn}
        />
      </div>

      {/* Detail Modal */}
      {selectedJob && !selectionMode && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdate={handleJobUpdate}
          onDelete={handleJobDelete}
        />
      )}

      {/* Add Job Modal */}
      {showAddJob && <AddJobModal onClose={() => setShowAddJob(false)} onAdded={handleAddJob} />}

      {/* Skills Trend Modal */}
      {showSkills && <SkillsTrendModal onClose={() => setShowSkills(false)} />}

      {/* Career Events Modal */}
      {showEvents && <CareerEventsModal onClose={() => setShowEvents(false)} />}

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Pipeline Modal */}
      {showPipeline && <PipelineModal onClose={() => setShowPipeline(false)} />}
    </div>
  );
}
