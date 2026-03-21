import { Router, Request, Response } from "express";
import db from "../db";

const router = Router();

// GET /api/events — list career events with optional filters
// Query params: upcoming=true, location=dublin, type=career_fair
router.get("/", (req: Request, res: Response) => {
  const { upcoming, location, type } = req.query;

  let query = "SELECT * FROM career_events WHERE 1=1";
  const params: string[] = [];

  if (upcoming === "true") {
    const today = new Date().toISOString().split("T")[0];
    query += " AND (event_date >= ? OR event_date IS NULL OR event_date = '')";
    params.push(today);
  }

  if (location && typeof location === "string") {
    query += " AND LOWER(location) LIKE ?";
    params.push(`%${location.toLowerCase()}%`);
  }

  if (type && typeof type === "string") {
    query += " AND event_type = ?";
    params.push(type);
  }

  query += " ORDER BY CASE WHEN event_date IS NULL OR event_date = '' THEN 1 ELSE 0 END, event_date ASC LIMIT 100";

  const events = db.prepare(query).all(...params);
  res.json(events);
});

// POST /api/events/batch — upsert multiple career events (called by pipeline)
router.post("/batch", (req: Request, res: Response) => {
  const { events } = req.body;
  if (!Array.isArray(events)) {
    res.status(400).json({ error: "events must be an array" });
    return;
  }

  let inserted = 0;
  for (const ev of events) {
    const eventUrl = ev.event_url || ev.url;
    if (!ev.title || !eventUrl) continue;
    const existing = db.prepare("SELECT id FROM career_events WHERE event_url = ?").get(eventUrl);
    if (!existing) {
      db.prepare(
        `INSERT INTO career_events (title, organizer, location, event_date, event_url, description, event_type, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        ev.title, ev.organizer || null, ev.location || null,
        ev.eventDate || ev.event_date || null, eventUrl,
        ev.description || null, ev.eventType || ev.event_type || "career_fair",
        ev.source || null
      );
      inserted++;
    }
  }

  res.json({ inserted, total: events.length });
});

// GET /api/events/export.ics — export events as iCalendar file
router.get("/export.ics", (req: Request, res: Response) => {
  const { upcoming, location, type } = req.query;

  let query = "SELECT * FROM career_events WHERE 1=1";
  const params: string[] = [];

  if (upcoming === "true") {
    const today = new Date().toISOString().split("T")[0];
    query += " AND (event_date >= ? OR event_date IS NULL OR event_date = '')";
    params.push(today);
  }
  if (location && typeof location === "string") {
    query += " AND LOWER(location) LIKE ?";
    params.push(`%${location.toLowerCase()}%`);
  }
  if (type && typeof type === "string") {
    query += " AND event_type = ?";
    params.push(type);
  }
  query += " ORDER BY event_date ASC LIMIT 200";

  const events = db.prepare(query).all(...params) as any[];

  // Build iCalendar
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JobTracker//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Career Events",
  ];

  for (const ev of events) {
    const dtStart = formatIcsDate(ev.event_date);
    const dtEnd = formatIcsDate(ev.event_date, 2); // assume 2 hours
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
router.delete("/:id", (req: Request, res: Response) => {
  const result = db.prepare("DELETE FROM career_events WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
