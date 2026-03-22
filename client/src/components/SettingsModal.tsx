import { useEffect, useState } from "react";
import {
  fetchSettings, updateSettings,
  SettingsData, PipelineConfig,
} from "../api";
import ResumePoolTab from "./ResumePoolTab";

interface Props {
  onClose: () => void;
}

type Tab = "pool" | "pipeline" | "scrapers";

const KEYWORD_OPTIONS = [
  "Software Engineer", "Backend Developer", "Frontend Developer", "Fullstack Developer",
  "DevOps Engineer", "Cloud Engineer", "Data Engineer", "Data Scientist",
  "Machine Learning Engineer", "AI Engineer", "Site Reliability Engineer",
  "Mobile Developer", "iOS Developer", "Android Developer",
  "Platform Engineer", "Infrastructure Engineer", "Security Engineer",
  "QA Engineer", "Embedded Engineer", "Systems Engineer",
];

const JOB_LEVEL_OPTIONS = [
  "Intern", "Junior", "Associate", "Mid", "SDE 1", "SDE 2",
  "Senior", "Staff", "Principal", "Lead", "Manager", "Director", "VP",
];

const COUNTRY_OPTIONS = [
  "United States", "United Kingdom", "Ireland", "Canada", "Germany",
  "Netherlands", "France", "Australia", "India", "Singapore", "Remote",
];

const RESUME_SECTIONS = [
  "summary", "skills", "experience", "projects", "education", "certifications", "awards",
];

export default function SettingsModal({ onClose }: Props) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pool");
  const [saving, setSaving] = useState(false);

  // Local editable config state
  const [config, setConfig] = useState<PipelineConfig | null>(null);

  useEffect(() => {
    fetchSettings()
      .then((d) => { setData(d); setConfig(d.config); })
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  function flash(msg: string) {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  }

  async function handleSaveConfig() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      await updateSettings(config);
      flash("Settings saved. Changes take effect on next pipeline run.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function updateConfig<K extends keyof PipelineConfig>(key: K, value: PipelineConfig[K]) {
    setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  // ── Helpers for comma-separated multi-select fields ──
  function parseCSV(val: string): string[] {
    return val.split(",").map(s => s.trim()).filter(Boolean);
  }

  function toggleChip(field: "JOB_LEVELS" | "TARGET_COUNTRIES" | "SEARCH_KEYWORDS", item: string) {
    if (!config) return;
    const current = parseCSV(config[field]);
    const next = current.includes(item)
      ? current.filter(v => v !== item)
      : [...current, item];
    updateConfig(field, next.join(","));
  }

  // ── Helpers for resume order ──
  function getOrderSections(): string[] {
    if (!config) return [];
    return parseCSV(config.RESUME_ORDER);
  }

  function moveSection(from: number, to: number) {
    const arr = getOrderSections();
    if (to < 0 || to >= arr.length) return;
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    updateConfig("RESUME_ORDER", copy.join(","));
  }

  function toggleSection(section: string) {
    const arr = getOrderSections();
    if (arr.includes(section)) {
      updateConfig("RESUME_ORDER", arr.filter(s => s !== section).join(","));
    } else {
      updateConfig("RESUME_ORDER", [...arr, section].join(","));
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "pool", label: "Resume Pool" },
    { id: "pipeline", label: "Pipeline" },
    { id: "scrapers", label: "Scrapers" },
  ];

  const intensityLabel = (v: number) => v <= 3 ? "Low" : v <= 6 ? "Medium" : "High";
  const intensityColor = (v: number) => v <= 3 ? "text-blue-400" : v <= 6 ? "text-amber-400" : "text-red-400";

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0d0f13] border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/60 shrink-0">
          <h2 className="text-base font-bold text-gray-50">Settings</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-3 gap-1 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                tab === t.id
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                  : "text-gray-500 hover:text-gray-300 border border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Feedback */}
        {(error || success) && (
          <div className={`mx-6 mt-3 px-3 py-2 rounded-lg text-xs ${
            error ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
          }`}>
            {error || success}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && config && tab === "pipeline" && (
            <div className="space-y-4">
              {/* Relevance threshold */}
              <div className="p-4 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-semibold text-gray-300">Relevance Score Threshold</h4>
                  <span className="text-sm font-bold text-gray-200 tabular-nums">{config.RELEVANCE_SCORE_THRESHOLD}/10</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">Minimum match score for a job to pass through the pipeline</p>
                <input
                  type="range"
                  min={1} max={10} step={1}
                  value={config.RELEVANCE_SCORE_THRESHOLD}
                  onChange={(e) => updateConfig("RELEVANCE_SCORE_THRESHOLD", parseInt(e.target.value))}
                  className="w-full accent-blue-500 h-1.5"
                />
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>1 (all jobs)</span><span>5 (decent)</span><span>10 (perfect only)</span>
                </div>
              </div>

              {/* Tailoring intensity */}
              <div className="p-4 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-semibold text-gray-300">Tailoring Intensity</h4>
                  <span className={`text-sm font-bold tabular-nums ${intensityColor(config.TAILORING_INTENSITY)}`}>
                    {config.TAILORING_INTENSITY}/10 ({intensityLabel(config.TAILORING_INTENSITY)})
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">How aggressively the resume is rewritten to match each JD</p>
                <input
                  type="range"
                  min={1} max={10} step={1}
                  value={config.TAILORING_INTENSITY}
                  onChange={(e) => updateConfig("TAILORING_INTENSITY", parseInt(e.target.value))}
                  className="w-full accent-amber-500 h-1.5"
                />
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>1 (light touch)</span><span>5 (balanced)</span><span>10 (aggressive)</span>
                </div>
              </div>

              {/* Numeric settings row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                  <label className="text-xs text-gray-300 font-medium block mb-1">LinkedIn Jobs</label>
                  <p className="text-xs text-gray-500 mb-1">Apify scrape count</p>
                  <input
                    type="number"
                    value={20}
                    disabled
                    className="w-full bg-[#0c0f14] border border-gray-700/30 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 cursor-not-allowed opacity-60"
                  />
                </div>
                <div className="p-3 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                  <label className="text-xs text-gray-300 font-medium block mb-1">Max Jobs Limit</label>
                  <p className="text-xs text-gray-500 mb-1">Jobs processed per run</p>
                  <input
                    type="number"
                    value={config.MAX_JOBS_TEST_LIMIT}
                    onChange={(e) => updateConfig("MAX_JOBS_TEST_LIMIT", Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                    min={1} max={5}
                    className="w-full bg-[#0c0f14] border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
                <div className="p-3 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                  <label className="text-xs text-gray-300 font-medium block mb-1">Max Job Age (days)</label>
                  <input
                    type="number"
                    value={config.MAX_AGE_DAYS}
                    onChange={(e) => updateConfig("MAX_AGE_DAYS", parseInt(e.target.value) || 14)}
                    min={1} max={90}
                    className="w-full bg-[#0c0f14] border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                  <label className="text-xs text-gray-300 font-medium block mb-1">Max Required YOE</label>
                  <p className="text-xs text-gray-500 mb-1">-1 = no filter, 0 = freshers only</p>
                  <input
                    type="number"
                    value={config.MAX_REQ_YOE}
                    onChange={(e) => updateConfig("MAX_REQ_YOE", parseInt(e.target.value))}
                    min={-1} max={20}
                    className="w-full bg-[#0c0f14] border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
                <div className="p-3 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                  <label className="text-xs text-gray-300 font-medium block mb-1">Batch Delay (ms)</label>
                  <input
                    type="number"
                    value={config.BATCH_DELAY_MS}
                    onChange={(e) => updateConfig("BATCH_DELAY_MS", parseInt(e.target.value) || 2000)}
                    min={500} max={10000} step={500}
                    className="w-full bg-[#0c0f14] border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
                <div className="p-3 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                  <label className="text-xs text-gray-300 font-medium block mb-1">Poll Timeout (min)</label>
                  <input
                    type="number"
                    value={config.APIFY_MAX_POLL_MINUTES}
                    onChange={(e) => updateConfig("APIFY_MAX_POLL_MINUTES", parseInt(e.target.value) || 10)}
                    min={3} max={30}
                    className="w-full bg-[#0c0f14] border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Search keywords */}
              <div className="p-4 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                <label className="text-xs font-semibold text-gray-300 block mb-1">Search Keywords</label>
                <p className="text-xs text-gray-500 mb-3">Roles to search for across all scrapers</p>
                <div className="flex flex-wrap gap-1.5">
                  {KEYWORD_OPTIONS.map((kw) => {
                    const selected = parseCSV(config.SEARCH_KEYWORDS).includes(kw);
                    return (
                      <button
                        key={kw}
                        onClick={() => toggleChip("SEARCH_KEYWORDS", kw)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                          selected
                            ? "bg-blue-500/10 border-blue-500/25 text-blue-300"
                            : "bg-transparent border-gray-700/50 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                        }`}
                      >
                        {kw}
                      </button>
                    );
                  })}
                </div>
                {/* Show custom keywords not in preset list */}
                {(() => {
                  const custom = parseCSV(config.SEARCH_KEYWORDS).filter(k => !KEYWORD_OPTIONS.includes(k));
                  if (custom.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {custom.map((kw) => (
                        <button
                          key={kw}
                          onClick={() => toggleChip("SEARCH_KEYWORDS", kw)}
                          className="px-2.5 py-1 text-xs rounded-lg border bg-violet-500/10 border-violet-500/25 text-violet-300 transition-all"
                          title="Click to remove"
                        >
                          {kw} &times;
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {/* Add custom keyword */}
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Add custom role..."
                    className="w-full bg-[#0c0f14] border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 placeholder-gray-600 transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !parseCSV(config.SEARCH_KEYWORDS).includes(val)) {
                          const current = parseCSV(config.SEARCH_KEYWORDS);
                          updateConfig("SEARCH_KEYWORDS", [...current, val].join(","));
                        }
                        (e.target as HTMLInputElement).value = "";
                      }
                    }}
                  />
                </div>
              </div>

              {/* LinkedIn URL */}
              <div className="p-4 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                <label className="text-xs font-semibold text-gray-300 block mb-1">LinkedIn Search URL</label>
                <p className="text-xs text-gray-500 mb-2">The LinkedIn Jobs search URL used by Apify</p>
                <input
                  type="text"
                  value={config.LINKEDIN_SEARCH_URL}
                  onChange={(e) => updateConfig("LINKEDIN_SEARCH_URL", e.target.value)}
                  className="w-full bg-[#0c0f14] border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>

              {/* Target Countries */}
              <div className="p-4 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                <label className="text-xs font-semibold text-gray-300 block mb-1">Target Countries</label>
                <p className="text-xs text-gray-500 mb-3">Which countries to accept for job locations</p>
                <div className="flex flex-wrap gap-1.5">
                  {COUNTRY_OPTIONS.map((country) => {
                    const selected = parseCSV(config.TARGET_COUNTRIES).includes(country);
                    return (
                      <button
                        key={country}
                        onClick={() => toggleChip("TARGET_COUNTRIES", country)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                          selected
                            ? "bg-blue-500/10 border-blue-500/25 text-blue-300"
                            : "bg-transparent border-gray-700/50 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                        }`}
                      >
                        {country}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Job Levels */}
              <div className="p-4 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                <label className="text-xs font-semibold text-gray-300 block mb-1">Job Levels</label>
                <p className="text-xs text-gray-500 mb-3">Which seniority levels to accept (empty = all levels)</p>
                <div className="flex flex-wrap gap-1.5">
                  {JOB_LEVEL_OPTIONS.map((level) => {
                    const selected = parseCSV(config.JOB_LEVELS).includes(level);
                    return (
                      <button
                        key={level}
                        onClick={() => toggleChip("JOB_LEVELS", level)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                          selected
                            ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
                            : "bg-transparent border-gray-700/50 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                        }`}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Resume Section Order */}
              <div className="p-4 rounded-xl border border-gray-700/40 bg-[#0e1014]">
                <label className="text-xs font-semibold text-gray-300 block mb-1">Resume Section Order</label>
                <p className="text-xs text-gray-500 mb-3">Reorder and toggle sections for generated resumes</p>
                <div className="space-y-1">
                  {getOrderSections().map((section, idx) => (
                    <div key={section} className="flex items-center gap-2 p-2 rounded-lg bg-[#0c0f14] border border-gray-700/30">
                      <span className="text-xs text-gray-500 w-4 text-right">{idx + 1}</span>
                      <span className="text-xs text-gray-300 capitalize flex-1">{section}</span>
                      <button
                        onClick={() => moveSection(idx, idx - 1)}
                        disabled={idx === 0}
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:hover:text-gray-600 transition-colors p-0.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveSection(idx, idx + 1)}
                        disabled={idx === getOrderSections().length - 1}
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:hover:text-gray-600 transition-colors p-0.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => toggleSection(section)}
                        className="text-gray-600 hover:text-red-400 transition-colors p-0.5"
                        title="Remove section"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                {/* Show unused sections that can be added */}
                {(() => {
                  const active = getOrderSections();
                  const unused = RESUME_SECTIONS.filter(s => !active.includes(s));
                  if (unused.length === 0) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {unused.map((section) => (
                        <button
                          key={section}
                          onClick={() => toggleSection(section)}
                          className="px-2.5 py-1 text-xs rounded-lg border border-dashed border-gray-700/50 text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-all capitalize"
                        >
                          + {section}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="w-full text-sm font-medium text-gray-200 bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/50 py-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Pipeline Settings"}
              </button>
            </div>
          )}

          {tab === "pool" && (
            <ResumePoolTab onFlash={flash} onError={(msg) => setError(msg)} />
          )}

          {!loading && config && tab === "scrapers" && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400 mb-2">Toggle which free job sources are scraped alongside LinkedIn</p>
              {([
                { key: "SCRAPE_REMOTEOK", label: "RemoteOK", desc: "Remote-first tech jobs" },
                { key: "SCRAPE_JOBICY", label: "Jobicy", desc: "Remote jobs worldwide" },
                { key: "SCRAPE_ARBEITNOW", label: "Arbeitnow", desc: "European tech jobs" },
                { key: "SCRAPE_REMOTIVE", label: "Remotive", desc: "Curated remote jobs" },
                { key: "SCRAPE_HN", label: "Hacker News", desc: "Who is Hiring monthly threads" },
                { key: "SCRAPE_WWR", label: "We Work Remotely", desc: "Remote jobs board" },
                { key: "SCRAPE_DEVTO", label: "dev.to", desc: "Developer job listings" },
                { key: "SCRAPE_INDEED", label: "Indeed", desc: "Global job search engine" },
                { key: "SCRAPE_GLASSDOOR", label: "Glassdoor", desc: "Jobs with company reviews" },
                { key: "SCRAPE_CAREERJET", label: "CareerJet", desc: "Job search aggregator" },
                { key: "SCRAPE_SIMPLIFY", label: "Simplify", desc: "Tech jobs & easy apply" },
                { key: "SCRAPE_NAUKRI", label: "Naukri", desc: "Indian job portal" },
                { key: "SCRAPE_ASHBY", label: "Ashby ATS", desc: "Company career pages (AI-discovered)" },
                { key: "SCRAPE_LEVER", label: "Lever ATS", desc: "Company career pages (AI-discovered)" },
                { key: "SCRAPE_GREENHOUSE", label: "Greenhouse ATS", desc: "Company career pages (AI-discovered)" },
              ] as { key: keyof PipelineConfig; label: string; desc: string }[]).map(({ key, label, desc }) => (
                <label
                  key={key}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-700/40 bg-[#0e1014] hover:border-gray-700/60 transition-colors cursor-pointer"
                >
                  <div>
                    <span className="text-xs font-medium text-gray-200">{label}</span>
                    <span className="text-xs text-gray-500 ml-2">{desc}</span>
                  </div>
                  <div
                    onClick={() => updateConfig(key, !(config[key] as boolean) as any)}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      config[key] ? "bg-emerald-500/30" : "bg-gray-800"
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                      config[key] ? "left-4 bg-emerald-400" : "left-0.5 bg-gray-600"
                    }`} />
                  </div>
                </label>
              ))}

              {/* Save button */}
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="w-full text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 py-2.5 rounded-xl transition-all disabled:opacity-50 mt-2"
              >
                {saving ? "Saving..." : "Save Scraper Settings"}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800/60 shrink-0">
          <p className="text-xs text-gray-500">
            Changes to pipeline settings take effect on the next run.
          </p>
        </div>
      </div>
    </div>
  );
}
