import "./styles.css";
import { createAgentBridge } from "./agent-bridge.js";

const elements = {
  title: document.querySelector("#app-title"),
  connection: document.querySelector("#connection"),
  projectDir: document.querySelector("#project-dir"),
  version: document.querySelector("#state-version"),
  state: document.querySelector("#state-output"),
  refresh: document.querySelector("#refresh"),
  fullscreen: document.querySelector("#fullscreen"),
  select: document.querySelector("#action-select"),
  description: document.querySelector("#action-description"),
  input: document.querySelector("#action-input"),
  dryRun: document.querySelector("#dry-run"),
  execute: document.querySelector("#execute"),
  send: document.querySelector("#send-to-agent"),
  status: document.querySelector("#action-status"),
};

let actions = [];
let currentState = null;

const bridge = createAgentBridge({
  name: "agent-plugin-core",
  version: "0.1.0",
  defaultDisplayMode: "fullscreen",
  onContext(context) {
    if (context.displayName) elements.title.textContent = context.displayName;
    if (context.projectDir) elements.projectDir.textContent = context.projectDir;
    if (Array.isArray(context.actions)) {
      actions = context.actions;
      renderActions();
    }
  },
});

function setStatus(message, kind = "normal") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function renderActions() {
  const selected = elements.select.value;
  elements.select.innerHTML = "";
  for (const action of actions) {
    const option = document.createElement("option");
    option.value = action.name;
    option.textContent = `${action.title}${action.destructive ? " ⚠" : ""}`;
    elements.select.append(option);
  }
  if (actions.some((action) => action.name === selected)) elements.select.value = selected;
  describeAction();
}

function describeAction() {
  const action = actions.find((candidate) => candidate.name === elements.select.value);
  if (!action) return;
  elements.description.textContent = `${action.description} · ${action.readOnly ? "read only" : "writes state"}`;
  const example = {};
  for (const [key, schema] of Object.entries(action.inputSchema?.properties || {})) {
    if (action.inputSchema?.required?.includes(key)) {
      example[key] = schema.enum?.[0] ?? (schema.type === "string" ? "" : null);
    }
  }
  elements.input.value = pretty(example);
}

async function loadActions() {
  const result = await bridge.callTool("list_app_actions");
  actions = result.actions || [];
  renderActions();
}

async function refreshState() {
  elements.refresh.disabled = true;
  try {
    const result = await bridge.callTool("get_app_state");
    currentState = result.state;
    elements.projectDir.textContent = result.projectDir || bridge.projectDir || "Host default";
    elements.version.textContent = String(currentState?.version ?? "—");
    elements.state.textContent = pretty(currentState || {});
    setStatus("State refreshed from the authoritative MCP adapter.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.refresh.disabled = false;
  }
}

elements.select.addEventListener("change", describeAction);
elements.refresh.addEventListener("click", refreshState);
elements.fullscreen.addEventListener("click", () => bridge.requestFullscreen());
elements.execute.addEventListener("click", async () => {
  const action = elements.select.value;
  if (!action) return;
  elements.execute.disabled = true;
  try {
    const input = JSON.parse(elements.input.value || "{}");
    const result = await bridge.callTool("execute_app_action", {
      action,
      input,
      dryRun: elements.dryRun.checked,
      ...(currentState ? { expectedVersion: currentState.version } : {}),
    });
    setStatus(pretty(result), result.dryRun ? "normal" : "success");
    if (!result.dryRun) await refreshState();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.execute.disabled = false;
  }
});
elements.send.addEventListener("click", async () => {
  try {
    await bridge.sendMessage(
      `Inspect the connected application state below, propose the next useful actions, and use semantic MCP tools only after I approve consequential changes.\n\n${pretty(currentState || {})}`,
    );
    setStatus("Current state sent to the agent.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

bridge.connect()
  .then(async (capabilities) => {
    elements.connection.textContent = "Connected";
    elements.connection.classList.add("connected");
    if (!capabilities?.message) elements.send.hidden = true;
    await loadActions();
    await refreshState();
  })
  .catch((error) => {
    elements.connection.textContent = "Disconnected";
    setStatus(error.message, "error");
  });
