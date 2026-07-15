import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadAdapter, loadConfig, PLUGIN_ROOT, resolveProjectDir } from "./lib/config.mjs";
import { actionInputSchema } from "./lib/json-schema.mjs";

const manifest = JSON.parse(
  await readFile(path.join(PLUGIN_ROOT, ".codex-plugin", "plugin.json"), "utf8"),
);
const { config, configPath } = await loadConfig();
const { createApplicationAdapter } = await loadAdapter(config, configPath);
const adapter = createApplicationAdapter({ config, pluginRoot: PLUGIN_ROOT });
const actionNames = new Set(config.actions.map((action) => action.name));

const server = new McpServer(
  {
    name: manifest.name,
    version: manifest.version,
  },
  {
    instructions:
      "Operate the connected application through semantic MCP tools. Read capabilities and current state before mutating. Pass the active Codex workspace as projectDir. Prefer action-specific tools, use dryRun for risky multi-step changes, pass expectedVersion to guard against stale state, and verify final state after every mutation.",
  },
);

server.server.registerCapabilities({
  extensions: { "io.modelcontextprotocol/ui": {} },
});

registerWidgetResource();
registerCoreTools();
registerConfiguredActions();

await server.connect(new StdioServerTransport());

function textResult(text, structuredContent, meta) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
    ...(meta ? { _meta: meta } : {}),
  };
}

function projectArgsSchema() {
  return {
    projectDir: z.string().trim().optional().describe("Absolute active Codex workspace path."),
  };
}

function actionSummary(action) {
  return {
    name: action.name,
    title: action.title,
    description: action.description,
    readOnly: action.readOnly,
    destructive: action.destructive,
    idempotent: action.idempotent,
    inputSchema: action.inputSchema,
  };
}

function annotationsFor(action) {
  return {
    readOnlyHint: action.readOnly,
    destructiveHint: action.destructive,
    idempotentHint: action.idempotent,
    openWorldHint: false,
  };
}

function widgetMeta() {
  return {
    ui: {
      resourceUri: config.widget.resourceUri,
      visibility: ["model", "app"],
    },
    "ui/resourceUri": config.widget.resourceUri,
    "openai/outputTemplate": config.widget.resourceUri,
    "openai/widgetAccessible": true,
  };
}

function registerWidgetResource() {
  const metadata = {
    ui: {
      prefersBorder: false,
      csp: {
        connectDomains: [],
        resourceDomains: ["data:", "blob:"],
      },
    },
    "openai/widgetDescription": `${config.displayName} native application surface`,
    "openai/widgetPrefersBorder": false,
    "openai/widgetCSP": {
      connect_domains: [],
      resource_domains: ["data:", "blob:"],
    },
  };

  registerAppResource(
    server,
    "agent-plugin-core-widget",
    config.widget.resourceUri,
    {
      title: config.widget.title,
      description: config.description,
      _meta: metadata,
    },
    async () => ({
      contents: [
        {
          uri: config.widget.resourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(path.join(PLUGIN_ROOT, "dist", "widget", "index.html"), "utf8"),
          _meta: metadata,
        },
      ],
    }),
  );
}

function registerCoreTools() {
  registerAppTool(
    server,
    "render_agent_app",
    {
      title: `Open ${config.displayName}`,
      description: `Open the native ${config.displayName} widget for the active Codex workspace. Always pass projectDir.`,
      inputSchema: z.object({
        ...projectArgsSchema(),
        displayMode: z.enum(["inline", "fullscreen"]).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ...widgetMeta(),
        "openai/toolInvocation/invoking": `Opening ${config.displayName}...`,
        "openai/toolInvocation/invoked": `${config.displayName} ready`,
      },
    },
    async (input = {}) => {
      const projectDir = resolveProjectDir(input);
      const state = await adapter.getState({ projectDir });
      const displayMode = input.displayMode || config.widget.defaultDisplayMode;
      const payload = {
        version: 1,
        appId: config.appId,
        displayName: config.displayName,
        projectDir,
        displayMode,
        stateVersion: state.state.version,
        actions: config.actions.map(actionSummary),
      };
      return textResult(`Opened ${config.displayName} for ${projectDir}.`, payload, {
        "openai/outputTemplate": config.widget.resourceUri,
        widgetData: payload,
      });
    },
  );

  server.registerTool(
    "get_app_capabilities",
    {
      title: "Get Application Capabilities",
      description: "Read the connected application's supported actions, safety metadata, and automation features.",
      inputSchema: z.object(projectArgsSchema()),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input = {}) => {
      const capabilities = await adapter.getCapabilities();
      return textResult(`Loaded ${config.actions.length} application actions.`, capabilities);
    },
  );

  server.registerTool(
    "get_app_state",
    {
      title: "Get Application State",
      description: "Read the authoritative project-backed application state before planning or mutating.",
      inputSchema: z.object(projectArgsSchema()),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input = {}) => {
      const projectDir = resolveProjectDir(input);
      const result = await adapter.getState({ projectDir });
      return textResult(`Loaded application state version ${result.state.version}.`, result);
    },
  );

  server.registerTool(
    "list_app_actions",
    {
      title: "List Application Actions",
      description: "List semantic actions and their input/safety contracts.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const actions = config.actions.map(actionSummary);
      return textResult(`Available actions: ${actions.map((action) => action.name).join(", ")}.`, { actions });
    },
  );

  server.registerTool(
    "execute_app_action",
    {
      title: "Execute Application Action",
      description: "Generic fallback for executing a configured semantic action. Prefer the action-specific MCP tool when available.",
      inputSchema: z.object({
        ...projectArgsSchema(),
        action: z.string().trim(),
        input: z.record(z.string(), z.unknown()).optional().default({}),
        dryRun: z.boolean().optional(),
        expectedVersion: z.number().int().nonnegative().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      if (!actionNames.has(input.action)) throw new Error(`Unknown action: ${input.action}`);
      const result = await adapter.executeAction({
        projectDir: resolveProjectDir(input),
        action: input.action,
        input: input.input,
        dryRun: input.dryRun,
        expectedVersion: input.expectedVersion,
      });
      return textResult(`${input.dryRun ? "Previewed" : "Executed"} ${input.action}.`, result);
    },
  );

  server.registerTool(
    "apply_app_operations",
    {
      title: "Apply Application Operations",
      description: "Validate and apply multiple mutating actions atomically. Use dryRun first for consequential workflows.",
      inputSchema: z.object({
        ...projectArgsSchema(),
        operations: z.array(z.object({
          action: z.string().trim(),
          input: z.record(z.string(), z.unknown()).optional().default({}),
        })).min(1).max(100),
        dryRun: z.boolean().optional(),
        expectedVersion: z.number().int().nonnegative().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      for (const operation of input.operations) {
        if (!actionNames.has(operation.action)) throw new Error(`Unknown action: ${operation.action}`);
      }
      const result = await adapter.applyOperations({
        projectDir: resolveProjectDir(input),
        operations: input.operations,
        dryRun: input.dryRun,
        expectedVersion: input.expectedVersion,
      });
      return textResult(`${input.dryRun ? "Previewed" : "Applied"} ${input.operations.length} atomic operations.`, result);
    },
  );

  server.registerTool(
    "get_app_events",
    {
      title: "Get Application Audit Events",
      description: "Read recent committed application mutation events for verification and audit.",
      inputSchema: z.object({
        ...projectArgsSchema(),
        sinceVersion: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input = {}) => {
      const result = await adapter.getEvents({
        projectDir: resolveProjectDir(input),
        sinceVersion: input.sinceVersion,
        limit: input.limit,
      });
      return textResult(`Loaded ${result.events.length} audit events.`, result);
    },
  );
}

function registerConfiguredActions() {
  for (const action of config.actions) {
    server.registerTool(
      action.name,
      {
        title: action.title,
        description: action.description,
        inputSchema: actionInputSchema(action),
        annotations: annotationsFor(action),
      },
      async (input = {}) => {
        const { projectDir: _projectDir, dryRun, expectedVersion, ...actionInput } = input;
        const result = await adapter.executeAction({
          projectDir: resolveProjectDir(input),
          action: action.name,
          input: actionInput,
          dryRun,
          expectedVersion,
        });
        return textResult(`${dryRun ? "Previewed" : action.readOnly ? "Read" : "Executed"} ${action.name}.`, result);
      },
    );
  }
}
