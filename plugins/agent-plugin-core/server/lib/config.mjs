import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PLUGIN_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const RESERVED_TOOLS = new Set([
  "render_agent_app",
  "get_app_capabilities",
  "get_app_state",
  "list_app_actions",
  "execute_app_action",
  "apply_app_operations",
  "get_app_events",
]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

export function validateConfig(config) {
  if (!config || typeof config !== "object") throw new Error("Plugin config must be an object.");
  if (config.schemaVersion !== 1) throw new Error("Only config schemaVersion 1 is supported.");
  requiredString(config.appId, "appId");
  requiredString(config.displayName, "displayName");
  requiredString(config.description, "description");
  requiredString(config.adapter, "adapter");
  requiredString(config.widget?.resourceUri, "widget.resourceUri");
  requiredString(config.widget?.title, "widget.title");
  if (!config.widget.resourceUri.startsWith("ui://")) {
    throw new Error("widget.resourceUri must use the ui:// scheme.");
  }
  if (!["inline", "fullscreen"].includes(config.widget.defaultDisplayMode)) {
    throw new Error("widget.defaultDisplayMode must be inline or fullscreen.");
  }
  requiredString(config.storage?.directory, "storage.directory");
  requiredString(config.storage?.stateFile, "storage.stateFile");
  requiredString(config.storage?.eventsFile, "storage.eventsFile");
  if (!Array.isArray(config.actions) || config.actions.length === 0) {
    throw new Error("actions must contain at least one semantic action.");
  }

  const names = new Set();
  for (const action of config.actions) {
    const name = requiredString(action?.name, "actions[].name");
    requiredString(action.title, `action ${name}.title`);
    requiredString(action.description, `action ${name}.description`);
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(name)) {
      throw new Error(`Action name ${name} must be snake_case and 2-64 characters.`);
    }
    if (RESERVED_TOOLS.has(name)) throw new Error(`Action name ${name} is reserved.`);
    if (names.has(name)) throw new Error(`Duplicate action name: ${name}`);
    names.add(name);
    if (typeof action.readOnly !== "boolean") throw new Error(`action ${name}.readOnly must be boolean.`);
    if (typeof action.destructive !== "boolean") throw new Error(`action ${name}.destructive must be boolean.`);
    if (typeof action.idempotent !== "boolean") throw new Error(`action ${name}.idempotent must be boolean.`);
    if (!action.inputSchema || action.inputSchema.type !== "object") {
      throw new Error(`action ${name}.inputSchema must be an object JSON Schema.`);
    }
  }
  return config;
}

export async function loadConfig(configPath = process.env.AGENT_PLUGIN_CONFIG) {
  const resolved = path.resolve(configPath || path.join(PLUGIN_ROOT, "config", "agent-plugin.config.json"));
  const config = JSON.parse(await readFile(resolved, "utf8"));
  validateConfig(config);
  return { config, configPath: resolved };
}

export async function loadAdapter(config, configPath) {
  const requested = process.env.AGENT_PLUGIN_ADAPTER || config.adapter;
  const adapterPath = path.isAbsolute(requested)
    ? requested
    : path.resolve(path.dirname(configPath), "..", requested.replace(/^\.\//, ""));
  const module = await import(pathToFileURL(adapterPath).href);
  if (typeof module.createApplicationAdapter !== "function") {
    throw new Error(`Adapter ${adapterPath} must export createApplicationAdapter().`);
  }
  return { createApplicationAdapter: module.createApplicationAdapter, adapterPath };
}

export function resolveProjectDir(input = {}) {
  return path.resolve(
    input.projectDir || process.env.AGENT_PLUGIN_PROJECT_DIR || process.cwd(),
  );
}
