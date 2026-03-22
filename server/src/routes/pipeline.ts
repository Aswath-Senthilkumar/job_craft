import { Router, Request, Response } from "express";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

const router = Router();

// Track one running pipeline per user
const runningPipelines = new Map<string, ChildProcess>();

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function getAnonClient() {
  return require("../insforge-client").default;
}

// POST /api/pipeline/run — spawn pipeline and stream output via SSE
router.post("/run", async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Check if already running for this user
  if (runningPipelines.has(userId)) {
    res.status(409).json({ error: "Pipeline is already running" });
    return;
  }

  // Refresh the token to get a fresh access token with full TTL
  const { refreshToken } = req.body || {};
  let freshToken = "";

  if (refreshToken) {
    try {
      const client = getAnonClient();
      const { data, error } = await client.auth.refreshSession({ refreshToken });
      if (!error && data?.accessToken) {
        freshToken = data.accessToken;
      }
    } catch {}
  }

  // Fall back to the current request token if refresh fails
  if (!freshToken) {
    const authHeader = req.headers.authorization;
    freshToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  }

  if (!freshToken) {
    res.status(401).json({ error: "No valid token available" });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  function sendEvent(type: string, data: string) {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  }

  sendEvent("status", "Starting pipeline...");

  const pipelineDir = path.resolve(__dirname, "..", "..", "..", "pipeline");

  // Load pipeline's own .env so it has ANTHROPIC_API_KEY, PDF_BACKEND_URL, etc.
  const pipelineEnvPath = path.join(pipelineDir, ".env");
  const pipelineEnv: Record<string, string> = {};
  try {
    const envContent = fs.readFileSync(pipelineEnvPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        pipelineEnv[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
      }
    }
  } catch {
    sendEvent("error", "Could not read pipeline .env file");
  }

  // Spawn pipeline with fresh token + pipeline's env vars
  const tsxBin = path.join(pipelineDir, "node_modules", ".bin", "tsx");
  const child = spawn(tsxBin, ["src/index.ts"], {
    cwd: pipelineDir,
    env: {
      ...process.env,
      ...pipelineEnv,
      AUTH_TOKEN: freshToken,
      JOB_TRACKER_URL: `http://localhost:${process.env.PORT || 3002}`,
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  runningPipelines.set(userId, child);

  child.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      sendEvent("log", stripAnsi(line));
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      sendEvent("error", stripAnsi(line));
    }
  });

  child.on("close", (code) => {
    runningPipelines.delete(userId);
    sendEvent("done", code === 0 ? "Pipeline completed successfully" : `Pipeline exited with code ${code}`);
    res.end();
  });

  child.on("error", (err) => {
    runningPipelines.delete(userId);
    sendEvent("error", `Failed to start pipeline: ${err.message} | tsxBin: ${tsxBin} | pipelineDir: ${pipelineDir}`);
    sendEvent("done", "Pipeline failed to start");
    res.end();
  });

  // If client disconnects, kill the pipeline
  req.on("close", () => {
    if (runningPipelines.has(userId)) {
      child.kill("SIGTERM");
      runningPipelines.delete(userId);
    }
  });
});

// GET /api/pipeline/status — check if pipeline is running
router.get("/status", (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ running: runningPipelines.has(userId) });
});

// POST /api/pipeline/stop — stop running pipeline
router.post("/stop", (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const child = runningPipelines.get(userId);
  if (child) {
    child.kill("SIGTERM");
    runningPipelines.delete(userId);
    res.json({ stopped: true });
  } else {
    res.json({ stopped: false, message: "No pipeline running" });
  }
});

export default router;
