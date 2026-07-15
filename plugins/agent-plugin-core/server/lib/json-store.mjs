import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

function safeRelativePath(value, label) {
  const normalized = path.normalize(String(value));
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} must stay inside the active project.`);
  }
  return normalized;
}

export class JsonProjectStore {
  constructor({ storage, initialState }) {
    this.storage = storage;
    this.initialState = initialState;
  }

  paths(projectDir) {
    const storageDir = path.resolve(projectDir, safeRelativePath(this.storage.directory, "storage.directory"));
    const statePath = path.resolve(storageDir, safeRelativePath(this.storage.stateFile, "storage.stateFile"));
    const eventsPath = path.resolve(storageDir, safeRelativePath(this.storage.eventsFile, "storage.eventsFile"));
    if (!statePath.startsWith(`${storageDir}${path.sep}`) || !eventsPath.startsWith(`${storageDir}${path.sep}`)) {
      throw new Error("Configured storage escaped the storage directory.");
    }
    return { storageDir, statePath, eventsPath };
  }

  async read(projectDir) {
    const { statePath } = this.paths(projectDir);
    try {
      return JSON.parse(await readFile(statePath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return structuredClone(this.initialState());
    }
  }

  async write(projectDir, state) {
    const { storageDir, statePath } = this.paths(projectDir);
    await mkdir(storageDir, { recursive: true });
    const tempPath = `${statePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`);
    await rename(tempPath, statePath);
    return statePath;
  }

  async appendEvent(projectDir, event) {
    const { storageDir, eventsPath } = this.paths(projectDir);
    await mkdir(storageDir, { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`);
    return eventsPath;
  }

  async readEvents(projectDir, { sinceVersion = 0, limit = 100 } = {}) {
    const { eventsPath } = this.paths(projectDir);
    try {
      const lines = (await readFile(eventsPath, "utf8")).split("\n").filter(Boolean);
      return lines
        .map((line) => JSON.parse(line))
        .filter((event) => Number(event.afterVersion || 0) > sinceVersion)
        .slice(-Math.min(Math.max(limit, 1), 500));
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }
}
