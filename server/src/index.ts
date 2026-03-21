import "dotenv/config";
import path from "path";

import express from "express";
import cors from "cors";
import jobsRouter from "./routes/jobs";
import gmailRouter from "./routes/gmail";
import skillsRouter from "./routes/skills";
import eventsRouter from "./routes/events";
import settingsRouter from "./routes/settings";
import resumePoolRouter from "./routes/resume-pool";

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5174",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// Serve resume PDFs from /resumes/<filename>.pdf
app.use("/resumes", express.static(path.join(__dirname, "..", "resumes")));

app.use("/api/jobs", jobsRouter);
app.use("/api/gmail", gmailRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/resume-pool", resumePoolRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const server = app.listen(PORT, () => {
  console.log(`Job Tracker API running on http://localhost:${PORT}`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    const db = require("./db").default;
    db.close();
    console.log("Server closed.");
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
