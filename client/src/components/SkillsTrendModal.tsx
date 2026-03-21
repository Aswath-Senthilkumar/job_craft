import { useEffect, useState, useCallback } from "react";
import { SkillData } from "../types";
import { fetchCurrentSkills, fetchSkillFilters, SkillFilter } from "../api";

interface Props {
  onClose: () => void;
}

export default function SkillsTrendModal({ onClose }: Props) {
  const [skills, setSkills] = useState<SkillData[]>([]);
  const [resumeSkills, setResumeSkills] = useState<string[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Filter state
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [roles, setRoles] = useState<SkillFilter[]>([]);
  const [locations, setLocations] = useState<SkillFilter[]>([]);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  // Load filter options once
  useEffect(() => {
    fetchSkillFilters()
      .then((f) => {
        setRoles(f.roles);
        setLocations(f.locations);
      })
      .catch(() => {})
      .finally(() => setFiltersLoaded(true));
  }, []);

  // Load skills data (re-fetches when filters change)
  const loadSkills = useCallback(() => {
    setLoading(true);
    setError(null);
    const filters: { role?: string; location?: string } = {};
    if (selectedRole) filters.role = selectedRole;
    if (selectedLocation) filters.location = selectedLocation;

    fetchCurrentSkills(filters)
      .then((d) => {
        setSkills(d.skills);
        setTotalJobs(d.total_jobs);
        setResumeSkills(d.resume_skills || []);
      })
      .catch(() => setError("Failed to load skills data"))
      .finally(() => setLoading(false));
  }, [selectedRole, selectedLocation]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const filtered = search
    ? skills.filter((s) => s.skill.toLowerCase().includes(search.toLowerCase()))
    : skills;

  const maxCount = filtered[0]?.count || 1;

  // Colour tier based on percentage
  function barColor(pct: number) {
    if (pct >= 50) return "bg-emerald-500";
    if (pct >= 30) return "bg-blue-500";
    if (pct >= 15) return "bg-amber-500";
    return "bg-gray-600";
  }

  const hasActiveFilters = selectedRole || selectedLocation;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0d0f13] border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/60 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-50">Skills in Demand</h2>
            {totalJobs > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                Based on {totalJobs} processed job{totalJobs !== 1 ? "s" : ""}
                {hasActiveFilters && " (filtered)"}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 pt-3 pb-1 shrink-0 flex gap-2 flex-wrap items-center">
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="bg-[#0f1115] border border-gray-800/60 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500/40 transition-all min-w-[140px]"
          >
            <option value="">All Roles</option>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} ({r.count})
              </option>
            ))}
          </select>

          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="bg-[#0f1115] border border-gray-800/60 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500/40 transition-all min-w-[140px]"
          >
            <option value="">All Locations</option>
            {locations.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label} ({l.count})
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => { setSelectedRole(""); setSelectedLocation(""); }}
              className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-800/40 hover:border-gray-600 transition-all"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Search */}
        <div className="px-6 pt-2 pb-2 shrink-0">
          <input
            type="text"
            placeholder="Filter skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0f1115] border border-gray-800/60 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-blue-500/40 transition-all"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="text-sm text-red-400 py-8 text-center">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-sm text-gray-600 py-8 text-center">
              {search
                ? "No skills match your search."
                : hasActiveFilters
                ? "No jobs match the selected filters. Try broader criteria."
                : "No job descriptions yet. Run the pipeline first."}
            </p>
          )}
          {!loading && !error && filtered.length > 0 && (
            <div className="space-y-2 pb-4">
              {filtered.map((s, i) => (
                <div key={s.skill} className="flex items-center gap-3">
                  <span className="w-5 text-[10px] text-gray-600 text-right shrink-0">{i + 1}</span>
                  <div className="w-32 flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-gray-300 capitalize truncate">{s.skill}</span>
                    {s.onResume && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 shrink-0 leading-none">
                        yours
                      </span>
                    )}
                  </div>
                  <div className="flex-1 bg-gray-800/60 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${barColor(s.pct)}`}
                      style={{ width: `${(s.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs text-gray-500 shrink-0">
                    {s.pct}% <span className="text-gray-700">({s.count})</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800/60 shrink-0">
          <p className="text-[11px] text-gray-600">
            Skill demand from processed jobs. Skills tagged "yours" are on your resume. Use filters to drill down by role or location.
          </p>
        </div>
      </div>
    </div>
  );
}
