import { spawn } from "node:child_process";

const frontendPort = process.env.PORT || "5173";
const backendPort = process.env.LIFERL_API_PORT || "5174";
const host = process.env.HOST || "0.0.0.0";
const backendHost = process.env.LIFERL_API_HOST || "127.0.0.1";
const apiBaseUrl = process.env.API_INTERNAL_URL || `http://${backendHost}:${backendPort}`;

const children = [
  spawn("python3", ["-m", "uvicorn", "backend.main:app", "--host", host, "--port", backendPort], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn("bun", ["x", "next", "start", "-H", host, "-p", frontendPort], {
    stdio: "inherit",
    env: { ...process.env, API_INTERNAL_URL: apiBaseUrl, NEXT_PUBLIC_API_BASE_URL: "" },
  }),
];

function stopAll(signal = "SIGTERM") {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    stopAll();
    if (code && code !== 0) process.exitCode = code;
    if (signal) process.exitCode = 1;
  });
}

process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));
