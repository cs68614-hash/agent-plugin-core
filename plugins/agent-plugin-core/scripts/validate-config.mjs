import { loadAdapter, loadConfig } from "../server/lib/config.mjs";

const { config, configPath } = await loadConfig();
const { createApplicationAdapter, adapterPath } = await loadAdapter(config, configPath);
const adapter = createApplicationAdapter({ config });
for (const method of ["getCapabilities", "getState", "executeAction", "applyOperations", "getEvents"]) {
  if (typeof adapter[method] !== "function") throw new Error(`Adapter is missing ${method}().`);
}
console.log(`OK: ${config.appId} config, ${config.actions.length} actions, adapter ${adapterPath}`);
