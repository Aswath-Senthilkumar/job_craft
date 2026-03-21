import { useState, useEffect } from "react";
import { Job, JobStatus, COLUMNS } from "../types";
import { updateJobNotes, deleteJob, updateJobStatus } from "../api";

interface Props {
  job: Job;
  onClose: () => void;
  onUpdate: (updated: Job) => void;
  onDelete: (id: number) => void;
}

export default function JobDetailModal({ job, onClose, onUpdate, onDelete }: Props) {
  const [notes, setNotes] = useState(job.notes || "");
  const [saving, setSaving] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedDesc, setCopiedDesc] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setNotes(job.notes || "");
  }, [job]);

  async function handleSaveNotes() {
    setSaving(true);
    const updated = await updateJobNotes(job.id, notes);
    onUpdate(updated);
    setSaving(false);
  }

  async function handleDateChange(field: "interview_date" | "offer_date", value: string) {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdate(updated);
      }
    } catch (err) {
      console.error("Failed to update date:", err);
    }
  }

  async function handleStatusChange(status: JobStatus) {
    const updated = await updateJobStatus(job.id, status);
    onUpdate(updated);
  }

  async function handleDelete() {
    if (confirm("Delete this job card?")) {
      await deleteJob(job.id);
      onDelete(job.id);
    }
  }

  function handleCopyEmail() {
    if (job.outreach_email) {
      navigator.clipboard.writeText(job.outreach_email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleCopyDesc() {
    if (job.description) {
      navigator.clipboard.writeText(job.description);
      setCopiedDesc(true);
      setTimeout(() => setCopiedDesc(false), 2000);
    }
  }

  const currentCol = COLUMNS.find((c) => c.id === job.status);
  const daysAgo = job.applied_date
    ? Math.floor((Date.now() - new Date(job.applied_date).getTime()) / 86400000)
    : null;

  return (
    <div className="fixed inset-0 bg-black/70 modal-backdrop flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#0d0f13] border border-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient accent */}
        <div className={`relative p-6 border-b border-gray-800/50 bg-gradient-to-b ${currentCol?.gradient || ""}`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex items-start gap-3">
            {job.match_score != null && (
              <div className={`flex flex-col items-center justify-center w-14 px-2 py-2 rounded-xl border shrink-0 ${
                job.match_score >= 8
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : job.match_score >= 6
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              }`}>
                <span className="text-xl font-bold leading-none">{job.match_score}</span>
                <span className="text-[9px] opacity-60 font-normal leading-none mt-0.5">/10</span>
                <span className="text-[9px] opacity-50 leading-none mt-1">Match</span>
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-50 leading-tight">{job.job_title}</h2>
              <p className="text-blue-400 text-sm mt-1 font-medium">{job.company_name}</p>
            </div>
          </div>

          {/* Meta tags */}
          <div className="flex flex-wrap gap-2 mt-4">
            {job.location && (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-300 bg-gray-800/60 px-2.5 py-1 rounded-lg">
                <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                {job.location}
              </span>
            )}
            {job.salary && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {job.salary}
              </span>
            )}
            {job.seniority_level && (
              <span className="text-xs text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-lg">
                {job.seniority_level}
              </span>
            )}
            {job.applicants_count && (
              <span className="text-xs text-gray-400 bg-gray-800/60 px-2.5 py-1 rounded-lg">
                {job.applicants_count} applicants
              </span>
            )}
            {daysAgo !== null && (
              <span className="text-xs text-gray-500 bg-gray-800/40 px-2.5 py-1 rounded-lg">
                {daysAgo === 0 ? "Applied today" : `Applied ${daysAgo}d ago`}
              </span>
            )}
            {job.job_category && (
              <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${
                job.job_category === "startup" ? "text-violet-400 bg-violet-500/10" :
                job.job_category === "graduate" ? "text-sky-400 bg-sky-500/10" :
                "text-pink-400 bg-pink-500/10"
              }`}>
                {job.job_category === "startup" ? "Startup" : job.job_category === "graduate" ? "Grad Programme" : "Internship"}
              </span>
            )}
            <span className={`text-xs px-2.5 py-1 rounded-lg ${
              job.deadline
                ? Math.ceil((new Date(job.deadline).getTime() - Date.now()) / 86400000) <= 7
                  ? "text-amber-400 bg-amber-500/10"
                  : "text-gray-400 bg-gray-800/60"
                : "text-gray-600 bg-gray-800/30"
            }`}>
              {job.deadline
                ? `Deadline: ${new Date(job.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                : "No deadline specified"
              }
            </span>
          </div>
        </div>

        {/* Skill Match Analysis */}
        {job.match_reason && (
          <div className="px-6 py-3 border-b border-gray-800/50 bg-[#0a0c10]">
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mt-0.5">
                <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-emerald-400/80 uppercase tracking-wider mb-1">Skill Match Analysis</p>
                <p className="text-sm text-gray-300 leading-relaxed">{job.match_reason}</p>
                {job.notes?.includes("Reach role") && (
                  <p className="text-xs text-orange-400/80 mt-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400/60 inline-block" />
                    Flagged as reach role — you may not meet all requirements, but the match is strong enough to apply.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Keyword Breakdown */}
        {(job.matched_keywords || job.jd_keywords) && (
          <div className="px-6 py-3 border-b border-gray-800/50 bg-[#0a0c10]">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Skill Keywords</p>
            <div className="space-y-2">
              {job.matched_keywords && (() => {
                try {
                  const items: string[] = JSON.parse(job.matched_keywords);
                  if (items.length === 0) return null;
                  return (
                    <div>
                      <span className="text-[10px] font-semibold text-emerald-400/70 uppercase tracking-wider">Matched ({items.length})</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {items.map((s) => (
                          <span key={s} className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/15 px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
              {job.added_keywords && (() => {
                try {
                  const items: string[] = JSON.parse(job.added_keywords);
                  if (items.length === 0) return null;
                  return (
                    <div>
                      <span className="text-[10px] font-semibold text-blue-400/70 uppercase tracking-wider">Added by AI ({items.length})</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {items.map((s) => (
                          <span key={s} className="text-[11px] text-blue-300 bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
              {job.missing_keywords && (() => {
                try {
                  const items: string[] = JSON.parse(job.missing_keywords);
                  if (items.length === 0) return null;
                  return (
                    <div>
                      <span className="text-[10px] font-semibold text-orange-400/70 uppercase tracking-wider">Still Missing ({items.length})</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {items.map((s) => (
                          <span key={s} className="text-[11px] text-orange-300 bg-orange-500/10 border border-orange-500/15 px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
              {job.resume_keywords && (() => {
                try {
                  const items: string[] = JSON.parse(job.resume_keywords);
                  if (items.length === 0) return null;
                  return (
                    <details className="mt-1">
                      <summary className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-400">Resume Skills ({items.length})</summary>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {items.map((s) => (
                          <span key={s} className="text-[11px] text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    </details>
                  );
                } catch { return null; }
              })()}
              {job.jd_keywords && (() => {
                try {
                  const items: string[] = JSON.parse(job.jd_keywords);
                  if (items.length === 0) return null;
                  return (
                    <details className="mt-1">
                      <summary className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-400">JD Skills ({items.length})</summary>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {items.map((s) => (
                          <span key={s} className="text-[11px] text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    </details>
                  );
                } catch { return null; }
              })()}
            </div>
          </div>
        )}

        {/* Status Switcher */}
        <div className="px-6 py-3.5 border-b border-gray-800/50 bg-[#0a0c10]">
          <div className="flex gap-1.5 flex-wrap">
            {COLUMNS.map((col) => (
              <button
                key={col.id}
                onClick={() => handleStatusChange(col.id)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 font-medium
                  ${job.status === col.id
                    ? `${col.countBg} border-current`
                    : "bg-transparent text-gray-500 border-gray-800 hover:border-gray-600 hover:text-gray-300"
                  }
                `}
              >
                {col.emoji} {col.title}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="px-6 py-3 border-b border-gray-800/50 flex flex-wrap gap-2">
          {job.job_link && (
            <a href={job.job_link} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 bg-blue-500/8 hover:bg-blue-500/15 px-3 py-1.5 rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Job Post
            </a>
          )}
          {job.apply_url && (
            <a href={job.apply_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/8 hover:bg-emerald-500/15 px-3 py-1.5 rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Apply Now
            </a>
          )}
          {job.resume_url && (
            <a href={job.resume_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-400 bg-purple-500/8 hover:bg-purple-500/15 px-3 py-1.5 rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Resume
            </a>
          )}
          {job.company_url && (
            <a href={job.company_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-500/8 hover:bg-gray-500/15 px-3 py-1.5 rounded-lg transition-colors">
              Company
            </a>
          )}
        </div>

        {/* Outreach Email — TODO: re-enable in pipeline when outreach generation is implemented */}
        {job.outreach_email && (
          <div className="px-6 py-3 border-b border-gray-800/50">
            <button
              onClick={() => setShowEmail(!showEmail)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Outreach Email</span>
              <span className="text-gray-600 text-xs">{showEmail ? "Hide" : "Show"}</span>
            </button>
            {showEmail && (
              <div className="mt-3 relative">
                <div className="p-4 bg-[#0a0c10] rounded-xl text-sm text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed border border-gray-800/30">
                  {job.outreach_email}
                </div>
                <button
                  onClick={handleCopyEmail}
                  className="absolute top-2 right-2 text-[10px] font-medium bg-gray-700/80 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded-md transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {job.description && (
          <div className="px-6 py-3 border-b border-gray-800/50">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowDesc(!showDesc)}
                className="flex items-center gap-2 text-left"
              >
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Job Description</span>
                <span className="text-gray-600 text-xs">{showDesc ? "Hide" : "Show"}</span>
              </button>
              <button
                onClick={handleCopyDesc}
                className="text-[11px] font-medium bg-gray-700/80 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded-md transition-colors"
              >
                {copiedDesc ? "Copied!" : "Copy JD"}
              </button>
            </div>
            {showDesc && (
              <div className="mt-3 p-4 bg-[#0a0c10] rounded-xl text-sm text-gray-300 max-h-64 overflow-y-auto leading-relaxed whitespace-pre-wrap border border-gray-800/30">
                {job.description}
              </div>
            )}
          </div>
        )}

        {/* Date Tracking */}
        <div className="px-6 py-3 border-b border-gray-800/50">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-3">Date Tracking</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Interview Date</label>
              <input
                type="date"
                defaultValue={job.interview_date || ""}
                onBlur={(e) => handleDateChange("interview_date", e.target.value)}
                className="w-full bg-[#0a0c10] border border-gray-800/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
              {!job.interview_date && (
                <p className="text-xs text-gray-600 mt-1">Not scheduled</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Offer Date</label>
              <input
                type="date"
                defaultValue={job.offer_date || ""}
                onBlur={(e) => handleDateChange("offer_date", e.target.value)}
                className="w-full bg-[#0a0c10] border border-gray-800/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
              {!job.offer_date && (
                <p className="text-xs text-gray-600 mt-1">—</p>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="px-6 py-4 border-b border-gray-800/50">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Interview prep, contact info, thoughts..."
            className="w-full bg-[#0a0c10] border border-gray-800/50 rounded-xl p-3.5 text-sm text-gray-200 resize-none h-28 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-gray-700"
          />
          <div className="flex justify-between items-center mt-3">
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              className="text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save Notes"}
            </button>
            <button
              onClick={handleDelete}
              className="text-xs text-red-500/60 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 text-[11px] text-gray-600 flex justify-between">
          <span>Created: {new Date(job.created_at).toLocaleDateString()}</span>
          <span>Updated: {new Date(job.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
