import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputHtml = path.join(pluginRoot, "dist", "widget", "index.html");

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: pluginRoot,
    env: { ...process.env, FORCE_COLOR: "0", BROWSER: "none" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit ${result.status}.`);
}

async function newestMtime(root) {
  const info = await stat(root);
  if (info.isFile()) return info.mtimeMs;
  const entries = await readdir(root, { withFileTypes: true });
  const times = await Promise.all(entries.map((entry) => newestMtime(path.join(root, entry.name))));
  return Math.max(info.mtimeMs, ...times);
}

if (!existsSync(path.join(pluginRoot, "node_modules", "@modelcontextprotocol", "sdk"))) {
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"], "npm install");
}

const sourceMtime = Math.max(
  await newestMtime(path.join(pluginRoot, "widget")),
  statSync(path.join(pluginRoot, "vite.config.js")).mtimeMs,
  statSync(path.join(pluginRoot, "package.json")).mtimeMs,
);
if (!existsSync(outputHtml) || statSync(outputHtml).mtimeMs < sourceMtime) {
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:widget"], "Widget build");
}

process.chdir(pluginRoot);
await import(pathToFileURL(path.join(pluginRoot, "server", "index.mjs")).href);
