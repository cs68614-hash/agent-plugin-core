# Agent Plugin Core plugin

This directory is the installable Codex plugin. The repository-level [README](../../README.md) contains the full integration guide.

The included example exposes a versioned task board so every control-plane feature can be exercised before you replace it with your own application:

- native fullscreen MCP App Widget;
- semantic action-specific tools;
- generic action and atomic batch fallbacks;
- dry-run previews;
- optimistic concurrency with `expectedVersion`;
- project-local JSON storage;
- append-only audit events;
- operator and integrator Skills.

Development:

```bash
npm install
npm run quality
```

Customization entry points:

- `config/agent-plugin.config.json`: metadata and semantic action contracts;
- `app/adapter.mjs`: authoritative state and business operations;
- `widget/`: native application UI and MCP host bridge;
- `skills/`: instructions that teach Codex how to integrate and operate the system.
