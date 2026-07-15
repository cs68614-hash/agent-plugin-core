import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";

function resultPayload(result) {
  const value = result?.result || result?.detail?.result || result?.detail || result;
  return value?._meta?.widgetData || value?.structuredContent || value || {};
}

export function createAgentBridge({ name, version, defaultDisplayMode = "fullscreen", onContext }) {
  const app = new App(
    { name, version },
    { availableDisplayModes: ["inline", "fullscreen"] },
    { autoResize: true },
  );
  let projectDir = null;

  function capture(value) {
    const payload = resultPayload(value);
    const nextProjectDir = payload?.projectDir || value?.arguments?.projectDir;
    if (nextProjectDir) projectDir = nextProjectDir;
    onContext?.({ ...payload, projectDir });
  }

  function applyHostContext(context) {
    if (!context) return;
    if (context.theme) applyDocumentTheme(context.theme);
    if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  }

  app.ontoolinput = (params) => capture(params);
  app.ontoolresult = (params) => capture(params);
  app.onhostcontextchanged = applyHostContext;
  app.addEventListener?.("toolresult", capture);
  app.addEventListener?.("hostcontextchanged", (event) => applyHostContext(event.detail || event));

  return {
    app,
    get projectDir() {
      return projectDir;
    },
    async connect() {
      capture(window.openai?.toolOutput || {});
      await app.connect();
      applyHostContext(app.getHostContext?.());
      if (defaultDisplayMode === "fullscreen" && app.requestDisplayMode) {
        await app.requestDisplayMode({ mode: "fullscreen" }).catch(() => undefined);
      }
      return app.getHostCapabilities?.() || {};
    },
    async callTool(name, argumentsValue = {}) {
      if (!app.callServerTool) throw new Error("This MCP host does not expose ui/call-tool.");
      const result = await app.callServerTool({
        name,
        arguments: {
          ...(projectDir ? { projectDir } : {}),
          ...argumentsValue,
        },
      });
      if (result?.isError) {
        const message = result.content?.find((item) => item.type === "text")?.text;
        throw new Error(message || `${name} failed.`);
      }
      return result.structuredContent || result;
    },
    async sendMessage(text) {
      if (!app.sendMessage) throw new Error("This MCP host does not expose ui/message.");
      return app.sendMessage({ role: "user", content: [{ type: "text", text }] });
    },
    async requestFullscreen() {
      return app.requestDisplayMode?.({ mode: "fullscreen" });
    },
  };
}
