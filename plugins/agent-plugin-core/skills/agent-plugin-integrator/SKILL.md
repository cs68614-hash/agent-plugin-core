---
name: agent-plugin-integrator
description: Integrate an existing frontend or backend application with Agent Plugin Core. Use when the user asks Codex to expose application state and actions as MCP tools, add a native Codex widget, define agent-operable interfaces, customize the adapter, or write operating skills for an application.
---

# Agent Plugin Integrator

Turn the user's existing application into a semantic, verifiable Codex integration. Preserve the application's domain layer and UI where practical; add a narrow Adapter and MCP surface instead of duplicating business logic.

## Integration workflow

1. Inspect the existing application before editing:

- identify its domain/service layer;
- identify the authoritative state store or APIs;
- list user-visible actions and side effects;
- identify authentication, tenant, permission, and confirmation boundaries;
- identify frontend build output and CSP/network requirements.

2. Edit `config/agent-plugin.config.json`:

- replace the example app metadata;
- declare one semantic action per business operation;
- give every action a precise JSON Schema;
- mark `readOnly`, `destructive`, and `idempotent` honestly;
- use stable snake_case tool names;
- keep low-level UI gestures out of the action catalog.

3. Replace `app/adapter.mjs`:

- implement `getCapabilities()`;
- implement `getState({ projectDir })` from the authoritative system;
- implement `executeAction()` using existing services/APIs;
- implement atomic or compensating `applyOperations()`;
- implement `getEvents()` from an audit source;
- preserve version or ETag checks so stale agents cannot overwrite newer changes.

4. Integrate the frontend:

- keep realtime rendering, audio, video, Canvas/WebGL, and temporary UI state in the Widget;
- call MCP tools for durable semantic operations;
- send explicit messages to Codex with `sendMessage()` when a user wants agent help;
- request `fullscreen` only for application surfaces that benefit from a dedicated pane;
- declare required CSP domains on the MCP resource and never embed secret keys in the Widget.

5. Replace or extend the operator Skill:

- document the application's required read-before-write sequence;
- document confirmation gates;
- tell the agent how to verify every mutation;
- include common recovery behavior for conflicts and partial failures;
- avoid examples containing production IDs or secrets.

6. Verify the full integration:

```bash
npm install
npm run quality
```

Also run the Codex plugin validator from the plugin-creator skill. Open the Widget in a new Codex task and complete at least one read, one dry run, one committed mutation, one conflict test, and one final-state verification.

## Tool design standard

Prefer business language:

```text
create_campaign
schedule_episode
approve_invoice
move_clip
set_camera
publish_article
```

Avoid UI language:

```text
click_button
type_text
select_row
open_modal
```

A strong mutation result includes `ok`, stable object IDs, `beforeVersion`, `afterVersion`, a mutation/audit ID, and enough structured data to verify the outcome.

## Boundaries

- Do not weaken production authorization because Codex is the caller.
- Do not treat Widget visibility as permission to mutate data.
- Require explicit confirmation for irreversible external actions.
- Do not claim the integration is complete until the real backend and real Widget have been exercised, not only mocked unit tests.
