#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

type Config = {
  recordsPath: string;
  databasePath?: string;
  port: number;
  apiPort?: number;
  host: string;
  updatedAt: string;
};

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const stateDir = path.join(rootDir, ".liferl");
const configPath = path.join(stateDir, "config.json");
const pidPath = path.join(stateDir, "server.pid");
const outLogPath = path.join(stateDir, "server.out.log");
const errLogPath = path.join(stateDir, "server.err.log");
const systemdUnitName = "liferl.service";
const systemdUserDir = path.join(os.homedir(), ".config", "systemd", "user");
const systemdUnitPath = path.join(systemdUserDir, systemdUnitName);

function usage() {
  console.log(`LifeRL CLI

Usage:
  bun run service setup              Ask for SQLite path, Markdown path, host, and port
  bun run service setup --db /srv/liferl/liferl.db --records /srv/liferl/liferl.md --host 0.0.0.0 --port 5173 --api-port 5174 --yes
  bun run service run                Run server in the foreground
  bun run service start              Start server in the background
  bun run service stop               Stop background server
  bun run service restart            Restart background server
  bun run service status             Show config and process status
  bun run service logs               Print recent background logs
  bun run service systemd:print      Print a Linux systemd user unit
  bun run service systemd:install    Install and start systemd user service
  bun run service systemd:uninstall  Stop and remove systemd user service

Config:
  .liferl/config.json

Env used by the server:
  LIFERL_DB_PATH=/path/to/liferl.db
  LIFERL_RECORDS_PATH=/path/to/liferl.md
  PORT=5173
  LIFERL_API_PORT=5174
  HOST=0.0.0.0
`);
}

function expandHome(value: string) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function systemdQuote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function run(command: string, args: string[]) {
  return spawnSync(command, args, { encoding: "utf8" });
}

function apiPort(config: Config) {
  return config.apiPort ?? config.port + 1;
}

function productionServerCommand(config: Config) {
  return `${systemdQuote(process.execPath)} run build && exec ${systemdQuote(process.execPath)} run scripts/start.mjs`;
}

async function readConfig(): Promise<Config | null> {
  try {
    return JSON.parse(await fs.readFile(configPath, "utf8")) as Config;
  } catch {
    return null;
  }
}

async function writeConfig(config: Config) {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function ensureConfig() {
  const config = await readConfig();
  if (config) return config;
  console.log("No config found. Running setup.");
  return setup(new Map());
}

function parseOptions(args: string[]) {
  const options = new Map<string, string | boolean>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      options.set(rawKey, inlineValue);
    } else if (args[i + 1] && !args[i + 1].startsWith("--")) {
      options.set(rawKey, args[i + 1]);
      i += 1;
    } else {
      options.set(rawKey, true);
    }
  }
  return options;
}

function optionString(options: Map<string, string | boolean>, key: string) {
  const value = options.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function ask(rl: ReturnType<typeof createInterface> | null, question: string, fallback: string) {
  if (!rl) return fallback;
  const answer = await rl.question(question);
  return answer.trim() || fallback;
}

async function setup(options: Map<string, string | boolean>) {
  const current = await readConfig();
  const shouldPrompt = input.isTTY && !options.has("yes");
  const rl = shouldPrompt ? createInterface({ input, output }) : null;

  const defaultRecordsPath = current?.recordsPath ?? path.join(rootDir, "liferl.md");
  const recordsAnswer = optionString(options, "records") || optionString(options, "markdown");
  const recordsPath = path.resolve(expandHome(recordsAnswer || await ask(rl, `Markdown path [${defaultRecordsPath}]: `, defaultRecordsPath)));

  const defaultDatabasePath = current?.databasePath ?? path.join(stateDir, "liferl.db");
  const databaseAnswer = optionString(options, "db") || optionString(options, "database");
  const databasePath = path.resolve(expandHome(databaseAnswer || await ask(rl, `SQLite path [${defaultDatabasePath}]: `, defaultDatabasePath)));

  const defaultHost = current?.host ?? "0.0.0.0";
  const host = optionString(options, "host") || await ask(rl, `Host [${defaultHost}]: `, defaultHost);

  const defaultPort = String(current?.port ?? 5173);
  const portAnswer = optionString(options, "port") || await ask(rl, `Port [${defaultPort}]: `, defaultPort);
  const port = Number(portAnswer) || 5173;

  const defaultApiPort = String(current?.apiPort ?? port + 1);
  const apiPortAnswer = optionString(options, "api-port") || optionString(options, "apiPort") || await ask(rl, `API port [${defaultApiPort}]: `, defaultApiPort);
  const apiPort = Number(apiPortAnswer) || port + 1;

  rl?.close();

  await fs.mkdir(path.dirname(recordsPath), { recursive: true });
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  if (!fsSync.existsSync(recordsPath)) {
    await fs.writeFile(recordsPath, "[[life]] [[rl]] [[habit]]\n\n<records>\nschema: liferl.v1\n</records>\n", "utf8");
  }

  const config = {
    recordsPath,
    databasePath,
    port,
    apiPort,
    host,
    updatedAt: new Date().toISOString(),
  };
  await writeConfig(config);

  console.log(`Config written: ${configPath}`);
  console.log(`SQLite: ${databasePath}`);
  console.log(`Markdown: ${recordsPath}`);
  console.log(`URL: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  console.log(`API: http://${host === "0.0.0.0" ? "localhost" : host}:${apiPort}`);
  return config;
}

function serverEnv(config: Config) {
  return {
    ...process.env,
    LIFERL_DB_PATH: config.databasePath ?? path.join(stateDir, "liferl.db"),
    LIFERL_RECORDS_PATH: config.recordsPath,
    PORT: String(config.port),
    LIFERL_API_PORT: String(apiPort(config)),
    API_INTERNAL_URL: `http://127.0.0.1:${apiPort(config)}`,
    NEXT_PUBLIC_API_BASE_URL: "",
    HOST: config.host,
  };
}

async function runForeground() {
  const config = await ensureConfig();
  const build = run(process.execPath, ["run", "build"]);
  if (build.status !== 0) {
    console.error(build.stdout);
    console.error(build.stderr);
    process.exitCode = build.status ?? 1;
    return;
  }

  const child = spawn(process.execPath, ["run", "scripts/start.mjs"], {
    cwd: rootDir,
    env: serverEnv(config),
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}

async function readPid() {
  try {
    return Number((await fs.readFile(pidPath, "utf8")).trim());
  } catch {
    return 0;
  }
}

async function startBackground() {
  const config = await ensureConfig();
  const existingPid = await readPid();
  if (existingPid && isRunning(existingPid)) {
    console.log(`LifeRL is already running. PID: ${existingPid}`);
    return;
  }

  await fs.mkdir(stateDir, { recursive: true });
  const out = fsSync.openSync(outLogPath, "a");
  const err = fsSync.openSync(errLogPath, "a");
  const child = spawn("sh", ["-lc", productionServerCommand(config)], {
    cwd: rootDir,
    env: serverEnv(config),
    detached: true,
    stdio: ["ignore", out, err],
  });

  child.unref();
  await fs.writeFile(pidPath, `${child.pid}\n`, "utf8");

  console.log(`LifeRL started in background. PID: ${child.pid}`);
  console.log(`URL: http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`);
  console.log(`Logs: ${outLogPath}`);
}

async function stopBackground() {
  const pid = await readPid();
  if (!pid || !isRunning(pid)) {
    await fs.rm(pidPath, { force: true });
    console.log("LifeRL is not running.");
    return;
  }

  process.kill(pid, "SIGTERM");
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!isRunning(pid)) break;
  }
  await fs.rm(pidPath, { force: true });
  console.log(`Stopped LifeRL. PID: ${pid}`);
}

async function status() {
  const config = await readConfig();
  const pid = await readPid();
  const running = Boolean(pid && isRunning(pid));

  console.log(`Status: ${running ? "running" : "stopped"}`);
  if (pid) console.log(`PID: ${pid}${running ? "" : " (stale)"}`);
  console.log(`Config: ${fsSync.existsSync(configPath) ? configPath : "missing"}`);
  if (config) {
    console.log(`SQLite: ${config.databasePath ?? path.join(stateDir, "liferl.db")}`);
    console.log(`Markdown: ${config.recordsPath}`);
    console.log(`Frontend bind: ${config.host}:${config.port}`);
    console.log(`API bind: ${config.host}:${apiPort(config)}`);
    console.log(`URL: http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`);
    console.log(`API: http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${apiPort(config)}`);
  }
  console.log(`Logs: ${outLogPath}`);
}

async function logs() {
  for (const file of [outLogPath, errLogPath]) {
    console.log(`\n==> ${file}`);
    const text = await fs.readFile(file, "utf8").catch(() => "");
    const lines = text.trimEnd().split("\n").slice(-80);
    console.log(lines.join("\n"));
  }
}

function systemdUnit(config: Config) {
  return `[Unit]
Description=LifeRL SQLite-backed dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=${systemdQuote(rootDir)}
Environment=${systemdQuote(`LIFERL_RECORDS_PATH=${config.recordsPath}`)}
Environment=${systemdQuote(`LIFERL_DB_PATH=${config.databasePath ?? path.join(stateDir, "liferl.db")}`)}
Environment=${systemdQuote(`PORT=${config.port}`)}
Environment=${systemdQuote(`LIFERL_API_PORT=${apiPort(config)}`)}
Environment=${systemdQuote(`API_INTERNAL_URL=http://127.0.0.1:${apiPort(config)}`)}
Environment=${systemdQuote("NEXT_PUBLIC_API_BASE_URL=")}
Environment=${systemdQuote(`HOST=${config.host}`)}
ExecStart=/bin/sh -lc ${systemdQuote(productionServerCommand(config))}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;
}

async function printSystemdUnit() {
  const config = await ensureConfig();
  console.log(systemdUnit(config));
}

async function installSystemdUserService() {
  const config = await ensureConfig();
  await fs.mkdir(systemdUserDir, { recursive: true });
  await fs.writeFile(systemdUnitPath, systemdUnit(config), "utf8");

  const daemonReload = run("systemctl", ["--user", "daemon-reload"]);
  if (daemonReload.status !== 0) throw new Error(daemonReload.stderr || "systemctl --user daemon-reload failed");

  const enable = run("systemctl", ["--user", "enable", "--now", systemdUnitName]);
  if (enable.status !== 0) throw new Error(enable.stderr || `systemctl --user enable --now ${systemdUnitName} failed`);

  console.log(`Installed systemd user service: ${systemdUnitPath}`);
  console.log(`URL: http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`);
  console.log("Check with: systemctl --user status liferl.service");
}

async function uninstallSystemdUserService() {
  run("systemctl", ["--user", "disable", "--now", systemdUnitName]);
  await fs.rm(systemdUnitPath, { force: true });
  run("systemctl", ["--user", "daemon-reload"]);
  console.log("Removed systemd user service.");
}

async function main() {
  const command = process.argv[2] ?? "help";
  const options = parseOptions(process.argv.slice(3));

  if (command === "help" || command === "--help" || command === "-h") usage();
  else if (command === "setup" || command === "config") await setup(options);
  else if (command === "run") await runForeground();
  else if (command === "start") await startBackground();
  else if (command === "stop") await stopBackground();
  else if (command === "restart") {
    await stopBackground();
    await startBackground();
  } else if (command === "status") await status();
  else if (command === "logs") await logs();
  else if (command === "systemd:print") await printSystemdUnit();
  else if (command === "systemd:install") await installSystemdUserService();
  else if (command === "systemd:uninstall") await uninstallSystemdUserService();
  else {
    usage();
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
