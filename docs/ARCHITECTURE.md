# Architecture

Agent Plugin Core 将应用分成实时交互面和 Agent 控制面。

## 组件

### Codex Plugin

`.codex-plugin/plugin.json` 负责插件发现、展示、Skills 和 MCP Server 注册。仓库根部同时提供 Marketplace manifest，允许直接从 GitHub 安装。

### MCP App Widget

Widget 由 `registerAppResource` 注册为 `text/html;profile=mcp-app`，并通过：

```text
ui://agent-plugin-core/app.html
```

加载。`render_agent_app` 同时返回标准 `ui.resourceUri` 和 Codex 兼容字段 `openai/outputTemplate`。

Widget 使用 `App.connect()` 接入宿主，支持：

- `callServerTool()`：UI 调用 MCP 工具；
- `sendMessage()`：UI 将上下文或用户编辑发送给 Agent；
- `requestDisplayMode()`：请求 inline/fullscreen；
- host theme/style variables；
- tool input/result 事件。

### MCP Server

MCP Server 有三层工具：

1. Widget 工具：打开 UI；
2. 控制面工具：状态、能力、动作列表、批处理、事件；
3. 业务工具：根据配置动态注册，直接暴露给 Agent。

### Application Adapter

Adapter 是唯一应该了解真实后端的层。它负责：

- 权威状态读取；
- 输入到业务调用的映射；
- 权限、租户和认证上下文；
- dry-run 或计划接口；
- 版本/ETag 检查；
- 批处理事务或补偿；
- 审计读取。

### Storage

示例 Adapter 使用项目目录：

```text
<projectDir>/.agent-plugin-core/state.json
<projectDir>/.agent-plugin-core/events.jsonl
```

状态以临时文件加 rename 的方式原子替换。生产 SaaS 应换成数据库和对象存储。

## 两条数据流

Agent 发起：

```text
Codex → MCP action tool → Adapter → backend → structured result → verify state
```

用户从 Widget 发起：

```text
Widget → callServerTool → Adapter → backend → Widget refresh
Widget → sendMessage → Codex continues the workflow
```

## 为什么不用 DOM 自动化作为主接口

DOM 点击缺少稳定业务语义、版本保护、权限说明和结果验证。语义 MCP Tool 能提供明确输入 Schema、安全 annotations、结构化结果和审计 ID。Computer Use 仍可作为尚未接入能力的临时兜底，但不应替代核心业务接口。
