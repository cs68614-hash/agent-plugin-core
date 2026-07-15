import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectDir = await mkdtemp(path.join(tmpdir(), "agent-plugin-core-probe-"));
const client = new Client({ name: "agent-plugin-core-probe", version: "0.1.0" });
const transport = new StdioClientTransport({ command: "node", args: ["./scripts/start-mcp.mjs"] });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = new Set(tools.tools.map((tool) => tool.name));
  for (const required of [
    "render_agent_app",
    "get_app_capabilities",
    "get_app_state",
    "list_app_actions",
    "execute_app_action",
    "apply_app_operations",
    "get_app_events",
    "list_tasks",
    "create_task",
    "update_task",
    "delete_task",
  ]) {
    if (!names.has(required)) throw new Error(`Missing MCP tool: ${required}`);
  }

  const render = await client.callTool({
    name: "render_agent_app",
    arguments: { projectDir },
  });
  const uri = "ui://agent-plugin-core/app.html";
  if (render._meta?.["openai/outputTemplate"] !== uri) throw new Error("Missing outputTemplate metadata.");
  if (render.structuredContent?.displayMode !== "fullscreen") throw new Error("Widget did not default to fullscreen.");
  if (render.structuredContent?.projectDir !== projectDir) throw new Error("Render tool lost projectDir.");

  const resource = await client.readResource({ uri });
  const item = resource.contents?.[0];
  if (item?.mimeType !== "text/html;profile=mcp-app") throw new Error(`Unexpected widget MIME: ${item?.mimeType}`);
  if (!item?.text?.includes("Agent Plugin Core")) throw new Error("Widget HTML is missing the app shell.");

  const created = await client.callTool({
    name: "create_task",
    arguments: { projectDir, title: "Probe task", status: "todo", expectedVersion: 0 },
  });
  const task = created.structuredContent?.task;
  if (!task?.id || created.structuredContent?.afterVersion !== 1) throw new Error("create_task did not commit version 1.");

  const preview = await client.callTool({
    name: "delete_task",
    arguments: { projectDir, id: task.id, dryRun: true, expectedVersion: 1 },
  });
  if (!preview.structuredContent?.dryRun || preview.structuredContent?.afterVersion !== 2) {
    throw new Error("delete_task dry run did not return a versioned preview.");
  }

  const batch = await client.callTool({
    name: "apply_app_operations",
    arguments: {
      projectDir,
      expectedVersion: 1,
      operations: [
        { action: "update_task", input: { id: task.id, status: "done" } },
        { action: "create_task", input: { title: "Second task" } },
      ],
    },
  });
  if (!batch.structuredContent?.atomic || batch.structuredContent?.afterVersion !== 2) {
    throw new Error("Atomic batch did not commit version 2.");
  }

  const state = await client.callTool({ name: "get_app_state", arguments: { projectDir } });
  if (state.structuredContent?.state?.tasks?.length !== 2 || state.structuredContent.state.version !== 2) {
    throw new Error("Final state does not contain the probed operations.");
  }
  const events = await client.callTool({ name: "get_app_events", arguments: { projectDir } });
  if (events.structuredContent?.events?.length !== 2) throw new Error("Audit event count is incorrect.");

  console.log("OK: plugin tools, widget resource, dry run, version guard, atomic batch, and audit events work.");
} finally {
  await client.close().catch(() => undefined);
  await rm(projectDir, { recursive: true, force: true });
}
