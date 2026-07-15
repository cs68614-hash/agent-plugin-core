---
name: agent-plugin-operator
description: Operate an application connected through Agent Plugin Core. Use when the user asks Codex to inspect, create, update, delete, batch-change, automate, or verify data in the connected application, or asks to open its native Codex widget.
---

# Agent Plugin Operator

Use the application's semantic MCP tools as the source of truth. Do not automate the system by guessing DOM selectors or editing storage files directly when an MCP action exists.

## Operating workflow

1. Open the application when visual context is useful:

```json
{
  "projectDir": "/absolute/path/to/the/active/workspace",
  "displayMode": "fullscreen"
}
```

Call `render_agent_app`. Always pass the active user workspace as `projectDir` so application state is stored with the user's project, not inside the plugin installation.

2. Read `get_app_capabilities` and `get_app_state` before the first mutation in a workflow. Treat the returned `state.version` as the current optimistic concurrency version.

3. Prefer the action-specific tool such as `create_task` over `execute_app_action`. The action-specific schema gives the model clearer validation and safety annotations.

4. For a single reversible mutation:

- pass `projectDir`;
- pass the last observed `expectedVersion`;
- execute the action-specific tool;
- read `get_app_state` again and verify the requested outcome.

5. For a consequential or multi-step workflow:

- build the complete operation list;
- call `apply_app_operations` with `dryRun: true` and `expectedVersion`;
- inspect `previewState` and report any surprising consequences;
- obtain user confirmation when the workflow deletes, publishes, pays, messages external people, changes permissions, or otherwise has a meaningful external effect;
- call the same batch with `dryRun: false`;
- verify state and, when useful, read `get_app_events`.

6. If a tool returns a version conflict, do not retry blindly. Refresh state, reconsider the plan against the new version, and only then retry.

## Safety rules

- Respect MCP annotations. A tool marked destructive requires an explicit user request for that destructive outcome.
- Never claim success from a tool invocation message alone. Verify authoritative state.
- Do not bypass action validation by editing `.agent-plugin-core/state.json`.
- Do not expose credentials or secrets in tool inputs, audit events, chat messages, or state files.
- Use `execute_app_action` only as a compatibility fallback when no action-specific tool is available.
- Keep read-only exploration separate from mutation batches.

## Completion report

Report the application, action(s), before/after state version, key object identifiers, and verification result. Mention a dry run when no persistent change was made.
