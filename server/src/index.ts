import "dotenv/config";
import path from "path";

import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import jobsRouter from "./routes/jobs";
import gmailRouter from "./routes/gmail";
import skillsRouter from "./routes/skills";
import eventsRouter from "./routes/events";
import settingsRouter from "./routes/settings";
import resumePoolRouter from "./routes/resume-pool";
import pipelineRouter from "./routes/pipeline";
import { authMiddleware } from "./middleware/auth";

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5174",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// Auth routes — no auth middleware (pre-authentication)
app.use("/api/auth", authRouter);

// Health check — no auth needed
app.get("/health", (_req, res) => {
  res.json({ status: "ok", backend: "insforge" });
});

// Auth middleware — all routes below require authentication
app.use(authMiddleware);

app.use("/api/jobs", jobsRouter);
app.use("/api/gmail", gmailRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/resume-pool", resumePoolRouter);
app.use("/api/pipeline", pipelineRouter);

const server = app.listen(PORT, () => {
  console.log(`Job Tracker API running on http://localhost:${PORT}`);
  console.log(`Database backend: InsForge PostgreSQL`);
  console.log(`Authentication: InsForge Auth (required)`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});
