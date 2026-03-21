import { useState, useEffect, useRef, useCallback } from "react";
import { runPipeline, stopPipeline, getPipelineStatus } from "../api";

interface PipelineModalProps {
  onClose: () => void;
}

interface LogEntry {
  type: "log" | "error" | "status" | "done";
  text: string;
  time: string;
}

export default function PipelineModal({ onClose }: PipelineModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Check if pipeline is already running on mount
  useEffect(() => {
    getPipelineStatus().then(({ running }) => {
      if (running) setRunning(true);
    }).catch(() => {});
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const addLog = useCallback((type: string, data: string) => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs((prev) => [...prev, { type: type as LogEntry["type"], text: data, time }]);
  }, []);

  function handleStart() {
    setLogs([]);
    setRunning(true);
    setFinished(false);

    const controller = runPipeline(
      addLog,
      () => {
        setRunning(false);
        setFinished(true);
      },
      (err) => {
        addLog("error", err);
        setRunning(false);
        setFinished(true);
      },
    );
    controllerRef.current = controller;
  }

  function handleStop() {
    controllerRef.current?.abort();
    stopPipeline().catch(() => {});
    setRunning(false);
    setFinished(true);
    addLog("status", "Pipeline stopped by user");
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't abort on unmount — let pipeline continue running in background
    };
  }, []);

  function getLogColor(type: string): string {
    switch (type) {
      case "error": return "text-red-400";
      case "status": return "text-blue-400";
      case "done": return "text-emerald-400 font-medium";
      default: return "text-gray-300";
    }
  }

  function getLogIcon(text: string): string {
    if (text.includes("✓") || text.includes("✓")) return "text-emerald-400";
    if (text.includes("⚠") || text.includes("⚠")) return "text-yellow-400";
    if (text.includes("✗") || text.includes("✗")) return "text-red-400";
    if (text.includes(">>>") || text.includes(">>>")) return "text-cyan-400";
    return "";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0d0f13] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${running ? "bg-emerald-400 animate-pulse" : finished ? "bg-gray-500" : "bg-gray-600"}`} />
            <h2 className="text-lg font-semibold text-gray-100">Job Pipeline</h2>
            {running && (
              <span className="text-xs text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded-full">Running</span>
            )}
            {finished && !running && (
              <span className="text-xs text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded-full">Complete</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!running && !finished && (
              <button
                onClick={handleStart}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Run Pipeline
              </button>
            )}
            {running && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                Stop
              </button>
            )}
            {finished && !running && (
              <button
                onClick={handleStart}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Run Again
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1.5 rounded-lg hover:bg-gray-800/50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Terminal */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-5 py-3 font-mono text-sm leading-relaxed bg-[#07080a]"
          onScroll={handleScroll}
        >
          {logs.length === 0 && !running && (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3 py-16">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="text-base">Click <span className="text-emerald-400 font-medium">Run Pipeline</span> to start scraping and tailoring jobs</p>
              <p className="text-xs text-gray-700">Uses your settings and resume pool to find and process relevant jobs</p>
            </div>
          )}
          {logs.map((entry, i) => (
            <div key={i} className={`py-0.5 ${getLogColor(entry.type)} ${getLogIcon(entry.text)}`}>
              <span className="text-gray-600 select-none mr-2">{entry.time}</span>
              {entry.text}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 flex items-center justify-between">
          <span className="text-xs text-gray-600">
            {logs.length > 0 ? `${logs.length} log entries` : "Ready"}
          </span>
          {running && (
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Pipeline is running...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
