import { Draggable } from "@hello-pangea/dnd";
import { Job, Column } from "../types";
import { getAuthToken } from "../api";

const API_SERVER = import.meta.env.VITE_API_URL ?? "";
import InterviewPrepBadge from "./InterviewPrepBadge";

const SOURCE_COLORS: Record<string, string> = {
  linkedin: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  remoteok: "text-green-400 bg-green-500/10 border-green-500/20",
  jobicy: "text-teal-400 bg-teal-500/10 border-teal-500/20",
  arbeitnow: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  remotive: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  hn_hiring: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  weworkremotely: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  devto: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  careerjet: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  indeed: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  glassdoor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  ashby: "text-lime-400 bg-lime-500/10 border-lime-500/20",
  lever: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  greenhouse: "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
  simplify: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  naukri: "text-red-400 bg-red-500/10 border-red-500/20",
};

const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  remoteok: "RemoteOK",
  jobicy: "Jobicy",
  arbeitnow: "Arbeitnow",
  remotive: "Remotive",
  hn_hiring: "HN",
  weworkremotely: "WWR",
  devto: "dev.to",
  careerjet: "CareerJet",
  indeed: "Indeed",
  glassdoor: "Glassdoor",
  ashby: "Ashby",
  lever: "Lever",
  greenhouse: "Greenhouse",
  simplify: "Simplify",
  naukri: "Naukri",
};

interface Props {
  job: Job;
  index: number;
  column: Column;
  onClick: (job: Job) => void;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
  onOpenPrep?: (job: Job) => void;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
    score >= 6 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
    "text-red-400 bg-red-500/10 border-red-500/20";

  return (
    <div
      className={`text-xs lg:text-sm font-bold px-2 lg:px-2.5 py-0.5 lg:py-1 rounded border ${color} tabular-nums shrink-0`}
      title={`Skill Match Score: ${score}/10`}
    >
      {score}<span className="opacity-50 font-normal text-[9px] lg:text-[10px]">/10</span>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const styles: Record<string, string> = {
    startup: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    graduate: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    intern: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  };
  const labels: Record<string, string> = {
    startup: "STARTUP",
    graduate: "GRAD PROG",
    intern: "INTERN",
  };
  const style = styles[category] || "text-gray-400 bg-gray-500/10 border-gray-500/20";
  return (
    <span className={`inline-flex items-center text-[10px] font-bold border px-1.5 py-0.5 rounded ${style}`}>
      {labels[category] || category.toUpperCase()}
    </span>
  );
}

function getInitials(name: string) {
  return name
    .split(/[\s&]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const colors = [
    "from-blue-600 to-blue-800",
    "from-purple-600 to-purple-800",
    "from-emerald-600 to-emerald-800",
    "from-orange-600 to-orange-800",
    "from-pink-600 to-pink-800",
    "from-cyan-600 to-cyan-800",
    "from-rose-600 to-rose-800",
    "from-indigo-600 to-indigo-800",
  ];
  return colors[Math.abs(hash) % colors.length];
}

function formatDeadline(deadline: string | null): { label: string; urgent: boolean } {
  if (!deadline) return { label: "No deadline", urgent: false };
  const daysLeft = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return { label: "Expired", urgent: false };
  if (daysLeft === 0) return { label: "Due today", urgent: true };
  if (daysLeft === 1) return { label: "Due tomorrow", urgent: true };
  if (daysLeft <= 7) return { label: `${daysLeft}d left`, urgent: true };
  return { label: `${daysLeft}d left`, urgent: false };
}

export default function JobCard({ job, index, column, onClick, selectionMode, isSelected, onToggleSelect, onOpenPrep }: Props) {
  const daysAgo = job.applied_date
    ? Math.floor((Date.now() - new Date(job.applied_date).getTime()) / 86400000)
    : null;

  const isReach = job.notes?.toLowerCase().includes("reach role");
  const deadline = formatDeadline(job.deadline);

  const getResumeViewUrl = (url: string) => {
    // Cloud storage URLs may use encoded slashes (%2F)
    const decodedUrl = decodeURIComponent(url);
    const filename = decodedUrl.split("/").pop();
    const token = getAuthToken();
    return `${API_SERVER}/api/resume-pool/view/${filename}?token=${token}`;
  };

  function handleClick(e: React.MouseEvent) {
    if (selectionMode) {
      e.stopPropagation();
      onToggleSelect(job.id);
    } else {
      onClick(job);
    }
  }

  return (
    <Draggable draggableId={String(job.id)} index={index} isDragDisabled={selectionMode}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={handleClick}
          className={`group relative p-3 lg:p-4 rounded-xl border transition-all duration-200 cursor-pointer card-enter
            ${snapshot.isDragging
              ? "bg-gray-800 border-blue-500/50 shadow-xl shadow-blue-500/10 scale-[1.03] rotate-[1.5deg] z-50"
              : isSelected
              ? "bg-blue-900/20 border-blue-500/50"
              : `bg-[#0f1115] border-gray-800/80 ${column.cardAccent} hover:bg-[#13161b]`
            }
            ${job.status === "offer" ? "offer-glow" : ""}
          `}
        >
          {/* Selection checkbox overlay */}
          {selectionMode && (
            <div className={`absolute top-2 right-2 lg:top-2.5 lg:right-2.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
              isSelected ? "bg-blue-500 border-blue-500" : "border-gray-600 bg-transparent"
            }`}>
              {isSelected && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          )}

          {/* Top row: Company avatar + title + score */}
          <div className="flex items-start gap-2 lg:gap-2.5">
            <div className={`w-9 h-9 lg:w-11 lg:h-11 rounded-lg bg-gradient-to-br ${hashColor(job.company_name)} flex items-center justify-center text-xs lg:text-sm font-bold text-white shrink-0 mt-0.5`}>
              {getInitials(job.company_name)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm lg:text-base text-gray-100 leading-snug truncate">
                {job.job_title}
              </h3>
              <p className="text-xs lg:text-sm text-gray-400 truncate mt-0.5">{job.company_name}</p>
            </div>
            {!selectionMode && job.match_score != null && <ScoreBadge score={job.match_score} />}
          </div>

          {/* Badges row: REACH + category */}
          {(isReach || job.job_category) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {isReach && (
                <span className="inline-flex items-center text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded">
                  REACH
                </span>
              )}
              {job.job_category && <CategoryBadge category={job.job_category} />}
            </div>
          )}

          {/* Tags row */}
          <div className="flex flex-wrap items-center gap-1 lg:gap-1.5 mt-2">
            {job.location && (
              <span className="inline-flex items-center gap-1 text-[10px] lg:text-xs text-gray-500 bg-gray-800/60 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {job.location.length > 22 ? job.location.slice(0, 22) + "…" : job.location}
              </span>
            )}
            {job.salary && (
              <span className="inline-flex items-center text-[10px] lg:text-xs text-emerald-400/80 bg-emerald-500/8 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full">
                {job.salary}
              </span>
            )}
            {job.seniority_level && (
              <span className="inline-flex items-center text-[10px] lg:text-xs text-purple-400/80 bg-purple-500/8 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full">
                {job.seniority_level}
              </span>
            )}
          </div>

          {/* Source badges */}
          {job.source && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {(() => {
                const srcs: string[] = job.sources
                  ? (() => { try { return JSON.parse(job.sources); } catch { return [job.source]; } })()
                  : [job.source];
                const show = srcs.slice(0, 3);
                const extra = srcs.length - show.length;
                return (
                  <>
                    {show.map((s) => (
                      <span
                        key={s}
                        className={`inline-flex items-center text-[10px] font-medium border px-1.5 py-0.5 rounded ${
                          SOURCE_COLORS[s] || "text-gray-400 bg-gray-500/10 border-gray-500/20"
                        }`}
                      >
                        {SOURCE_LABELS[s] || s}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className="text-[10px] text-gray-600">+{extra}</span>
                    )}
                  </>
                );
              })()}
              {job.source_count && job.source_count > 1 && (
                <span className="text-[10px] text-gray-600 ml-0.5" title={`Found on ${job.source_count} job boards`}>
                  · {job.source_count} boards
                </span>
              )}
            </div>
          )}

          {/* Keyword match stats */}
          {job.matched_keywords && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {(() => {
                try {
                  const matched: string[] = JSON.parse(job.matched_keywords);
                  const added: string[] = job.added_keywords ? JSON.parse(job.added_keywords) : [];
                  const missing: string[] = job.missing_keywords ? JSON.parse(job.missing_keywords) : [];
                  return (
                    <>
                      <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded" title={matched.join(", ")}>
                        {matched.length} matched
                      </span>
                      {added.length > 0 && (
                        <span className="text-[10px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded" title={added.join(", ")}>
                          +{added.length} added
                        </span>
                      )}
                      {missing.length > 0 && (
                        <span className="text-[10px] font-medium text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded" title={missing.join(", ")}>
                          {missing.length} gaps
                        </span>
                      )}
                    </>
                  );
                } catch { return null; }
              })()}
            </div>
          )}

          {/* Deadline row */}
          <div className="flex items-center gap-1 mt-1.5 lg:mt-2">
            <svg className="w-2.5 h-2.5 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className={`text-xs lg:text-sm ${deadline.urgent ? "text-amber-400 font-medium" : "text-gray-600"}`}>
              {deadline.label}
            </span>
          </div>

          {/* Footer */}
          <div className="mt-2 pt-2 border-t border-gray-800/50 flex flex-col gap-1.5">
            {/* Row 1: date + applicants */}
            <div className="flex items-center gap-2">
              {daysAgo !== null && (
                <span className="text-xs lg:text-sm text-gray-600">
                  {daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo}d ago`}
                </span>
              )}
              {job.applicants_count && (
                <span className="text-xs text-gray-600 flex items-center gap-0.5">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {job.applicants_count}
                </span>
              )}
            </div>
            {/* Action badges */}
            {!selectionMode && (job.resume_url || (job.status === "interviewing" && onOpenPrep) || job.outreach_email) && (
              <div className="flex items-center gap-1.5">
                {job.resume_url && (
                  <a
                    href={getResumeViewUrl(job.resume_url)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[10px] lg:text-xs font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-md transition-colors"
                    title="View tailored resume PDF"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Resume
                  </a>
                )}
                {job.status === "interviewing" && onOpenPrep && (
                  <InterviewPrepBadge jobId={job.id} onClick={() => onOpenPrep(job)} />
                )}
                {job.outreach_email && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] lg:text-xs font-medium text-blue-400 bg-blue-500/10 px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-md"
                    title="Outreach email drafted — click card to view"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Email
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
