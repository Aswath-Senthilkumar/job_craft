import { useEffect, useMemo, useState } from "react";
import { CareerEvent } from "../types";
import { fetchEvents } from "../api";

const API_SERVER = import.meta.env.VITE_API_URL ?? "";

interface Props {
  onClose: () => void;
}

function formatEventDate(dateStr: string | null): string {
  if (!dateStr) return "Date TBD";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

const LOCATION_OPTIONS = [
  { value: "", label: "All locations" },
  { value: "online", label: "Online / Virtual" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "career_fair", label: "Career Fair" },
  { value: "conference", label: "Conference" },
  { value: "meetup", label: "Meetup" },
  { value: "workshop", label: "Workshop" },
  { value: "networking", label: "Networking" },
];

export default function CareerEventsModal({ onClose }: Props) {
  const [events, setEvents] = useState<CareerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState<"deadline" | "relevancy">("deadline");

  useEffect(() => {
    setLoading(true);
    setError(null);
    const filters: { location?: string; type?: string } = {};
    if (locationFilter) filters.location = locationFilter;
    if (typeFilter) filters.type = typeFilter;
    fetchEvents(!showAll, filters)
      .then(setEvents)
      .catch(() => setError("Failed to load events"))
      .finally(() => setLoading(false));
  }, [showAll, locationFilter, typeFilter]);

  // Relevancy weights: career_fair > workshop > conference > meetup > networking
  const RELEVANCY_WEIGHT: Record<string, number> = {
    career_fair: 5, workshop: 4, conference: 3, meetup: 2, networking: 1,
  };

  const sortedEvents = useMemo(() => {
    const sorted = [...events];
    if (sortBy === "deadline") {
      // Soonest deadline first, nulls last
      sorted.sort((a, b) => {
        const aDate = a.event_date ? new Date(a.event_date).getTime() : Infinity;
        const bDate = b.event_date ? new Date(b.event_date).getTime() : Infinity;
        if (aDate === Infinity && bDate === Infinity) return 0;
        return aDate - bDate;
      });
    } else {
      // Relevancy: by event type weight desc, then soonest deadline
      sorted.sort((a, b) => {
        const aWeight = RELEVANCY_WEIGHT[a.event_type] ?? 0;
        const bWeight = RELEVANCY_WEIGHT[b.event_type] ?? 0;
        if (bWeight !== aWeight) return bWeight - aWeight;
        const aDate = a.event_date ? new Date(a.event_date).getTime() : Infinity;
        const bDate = b.event_date ? new Date(b.event_date).getTime() : Infinity;
        return aDate - bDate;
      });
    }
    return sorted;
  }, [events, sortBy]);

  const eventTypeLabel: Record<string, string> = {
    career_fair: "Career Fair",
    meetup: "Meetup",
    networking: "Networking",
    conference: "Conference",
    workshop: "Workshop",
  };

  const eventTypeColor: Record<string, string> = {
    career_fair: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    meetup: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    networking: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    conference: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    workshop: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0d0f13] border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/60 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-50">Career Events</h2>
            <p className="text-xs text-gray-500 mt-0.5">Career fairs, meetups, conferences & workshops</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortBy("deadline")}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all font-medium ${
                sortBy === "deadline"
                  ? "bg-blue-500/15 border-blue-500/30 text-blue-400"
                  : "bg-transparent border-gray-800 text-gray-600 hover:border-gray-600 hover:text-gray-400"
              }`}
            >
              Deadline
            </button>
            <button
              onClick={() => setSortBy("relevancy")}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all font-medium ${
                sortBy === "relevancy"
                  ? "bg-blue-500/15 border-blue-500/30 text-blue-400"
                  : "bg-transparent border-gray-800 text-gray-600 hover:border-gray-600 hover:text-gray-400"
              }`}
            >
              Relevancy
            </button>
            <button
              onClick={() => setShowAll((v) => !v)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all font-medium ${
                showAll
                  ? "bg-gray-700/30 border-gray-600 text-gray-300"
                  : "bg-transparent border-gray-800 text-gray-600 hover:border-gray-600 hover:text-gray-400"
              }`}
            >
              {showAll ? "Show upcoming" : "Show all"}
            </button>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-800/40 shrink-0">
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="bg-[#0f1115] border border-gray-800/60 rounded-lg px-2.5 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-blue-500/40 cursor-pointer"
          >
            {LOCATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[#0f1115] border border-gray-800/60 rounded-lg px-2.5 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-blue-500/40 cursor-pointer"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {(locationFilter || typeFilter) && (
            <button
              onClick={() => { setLocationFilter(""); setTypeFilter(""); }}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Clear filters
            </button>
          )}
          <a
            href={`${API_SERVER}/api/events/export.ics?upcoming=${!showAll}${locationFilter ? `&location=${locationFilter}` : ""}${typeFilter ? `&type=${typeFilter}` : ""}`}
            download="career-events.ics"
            className="text-xs font-medium text-blue-400 bg-blue-500/8 hover:bg-blue-500/15 border border-blue-500/20 px-2.5 py-1.5 rounded-lg transition-colors ml-auto flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Export .ics
          </a>
          <span className="text-xs text-gray-600">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="text-sm text-red-400 py-8 text-center">{error}</p>}
          {!loading && !error && events.length === 0 && (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3">🗓</div>
              <p className="text-sm text-gray-500">No events found.</p>
              <p className="text-xs text-gray-600 mt-1">
                {locationFilter || typeFilter
                  ? "Try adjusting your filters."
                  : "Events are scraped automatically when you run the pipeline."}
              </p>
            </div>
          )}
          {!loading && !error && sortedEvents.length > 0 && (
            <div className="space-y-3 pb-4">
              {sortedEvents.map((ev) => {
                const days = daysUntil(ev.event_date);
                const isUrgent = days !== null && days >= 0 && days <= 7;
                const isPast = days !== null && days < 0;
                return (
                  <div
                    key={ev.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isPast
                        ? "bg-[#0a0c10] border-gray-800/40 opacity-50"
                        : isUrgent
                        ? "bg-amber-500/5 border-amber-500/20"
                        : "bg-[#0f1115] border-gray-800/60 hover:border-gray-700/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className={`inline-flex items-center text-[10px] font-bold border px-1.5 py-0.5 rounded ${
                              eventTypeColor[ev.event_type] || "text-gray-400 bg-gray-500/10 border-gray-500/20"
                            }`}
                          >
                            {eventTypeLabel[ev.event_type] || ev.event_type}
                          </span>
                          {isUrgent && (
                            <span className="text-[10px] font-bold text-amber-400">
                              {days === 0 ? "TODAY" : `${days}d away`}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-gray-100 leading-snug">{ev.title}</h3>
                        {ev.organizer && (
                          <p className="text-xs text-gray-500 mt-0.5">{ev.organizer}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {formatEventDate(ev.event_date)}
                          </span>
                          {ev.location && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              {ev.location}
                            </span>
                          )}
                        </div>
                        {ev.description && (
                          <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{ev.description}</p>
                        )}
                      </div>
                      {ev.event_url && (
                        <a
                          href={ev.event_url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/8 hover:bg-blue-500/15 border border-blue-500/20 px-2.5 py-1 rounded-lg transition-colors font-medium"
                        >
                          View →
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800/60 shrink-0">
          <p className="text-[11px] text-gray-600">
            Events are populated when the pipeline runs. Run the pipeline to refresh.
          </p>
        </div>
      </div>
    </div>
  );
}
