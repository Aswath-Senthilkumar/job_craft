import { Router, Request, Response } from "express";
import { getEvents, batchUpsertEvents, deleteEvent } from "../db-adapter";

const router = Router();

// GET /api/events — list career events with optional filters
router.get("/", async (req: Request, res: Response) => {
  const { upcoming, location, type } = req.query;
  const events = await getEvents({
    upcoming: upcoming === "true",
    location: location && typeof location === "string" ? location : undefined,
    type: type && typeof type === "string" ? type : undefined,
  }, req.insforgeClient);
  res.json(events);
});

// POST /api/events/batch — upsert multiple career events (called by pipeline)
router.post("/batch", async (req: Request, res: Response) => {
  const { events } = req.body;
  if (!Array.isArray(events)) {
    res.status(400).json({ error: "events must be an array" });
    return;
  }

  const inserted = await batchUpsertEvents(events, req.insforgeClient);
  res.json({ inserted, total: events.length });
});

// GET /api/events/export.ics — export events as iCalendar file
router.get("/export.ics", async (req: Request, res: Response) => {
  const { upcoming, location, type } = req.query;
  const events = await getEvents({
    upcoming: upcoming === "true",
    location: location && typeof location === "string" ? location : undefined,
    type: type && typeof type === "string" ? type : undefined,
  }, req.insforgeClient);

  // Build iCalendar
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JobTracker//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Career Events",
  ];

  for (const ev of events as any[]) {
    const dtStart = formatIcsDate(ev.event_date);
    const dtEnd = formatIcsDate(ev.event_date, 2);
    const uid = `event-${ev.id}@jobtracker`;
    const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    if (dtStart) lines.push(`DTSTART:${dtStart}`);
    if (dtEnd) lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${icsEscape(ev.title)}`);
    if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description.slice(0, 500))}`);
    if (ev.event_url) lines.push(`URL:${ev.event_url}`);
    if (ev.organizer) lines.push(`ORGANIZER;CN=${icsEscape(ev.organizer)}:MAILTO:noreply@jobtracker`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"career-events.ics\"");
  res.send(lines.join("\r\n"));
});

function formatIcsDate(dateStr: string | null, addHours = 0): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    if (addHours) d.setHours(d.getHours() + addHours);
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  } catch { return null; }
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// DELETE /api/events/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const success = await deleteEvent(req.params.id, req.insforgeClient);
  if (!success) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
