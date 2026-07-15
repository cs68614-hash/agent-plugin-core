import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApplicationAdapter } from "../app/adapter.mjs";
import { loadConfig } from "../server/lib/config.mjs";

async function fixture() {
  const projectDir = await mkdtemp(path.join(tmpdir(), "agent-plugin-adapter-test-"));
  const { config } = await loadConfig();
  return {
    projectDir,
    adapter: createApplicationAdapter({ config }),
    cleanup: () => rm(projectDir, { recursive: true, force: true }),
  };
}

test("mutations are versioned and reads do not mutate", async () => {
  const item = await fixture();
  try {
    const created = await item.adapter.executeAction({
      projectDir: item.projectDir,
      action: "create_task",
      input: { title: "Build adapter" },
      expectedVersion: 0,
    });
    assert.equal(created.afterVersion, 1);
    const listed = await item.adapter.executeAction({
      projectDir: item.projectDir,
      action: "list_tasks",
      input: {},
    });
    assert.equal(listed.afterVersion, 1);
    assert.equal(listed.tasks.length, 1);
  } finally {
    await item.cleanup();
  }
});

test("dry run returns a preview without writing", async () => {
  const item = await fixture();
  try {
    const preview = await item.adapter.executeAction({
      projectDir: item.projectDir,
      action: "create_task",
      input: { title: "Preview" },
      dryRun: true,
      expectedVersion: 0,
    });
    assert.equal(preview.previewState.tasks.length, 1);
    const state = await item.adapter.getState({ projectDir: item.projectDir });
    assert.equal(state.state.version, 0);
    assert.equal(state.state.tasks.length, 0);
  } finally {
    await item.cleanup();
  }
});

test("expectedVersion rejects stale automation", async () => {
  const item = await fixture();
  try {
    await item.adapter.executeAction({
      projectDir: item.projectDir,
      action: "create_task",
      input: { title: "First" },
      expectedVersion: 0,
    });
    await assert.rejects(
      item.adapter.executeAction({
        projectDir: item.projectDir,
        action: "create_task",
        input: { title: "Stale" },
        expectedVersion: 0,
      }),
      /Version conflict/,
    );
  } finally {
    await item.cleanup();
  }
});

test("batch operations commit once and append one audit event", async () => {
  const item = await fixture();
  try {
    const batch = await item.adapter.applyOperations({
      projectDir: item.projectDir,
      expectedVersion: 0,
      operations: [
        { action: "create_task", input: { title: "One" } },
        { action: "create_task", input: { title: "Two", status: "in_progress" } },
      ],
    });
    assert.equal(batch.afterVersion, 1);
    assert.equal(batch.results.length, 2);
    const state = await item.adapter.getState({ projectDir: item.projectDir });
    assert.equal(state.state.tasks.length, 2);
    const events = await item.adapter.getEvents({ projectDir: item.projectDir });
    assert.equal(events.events.length, 1);
  } finally {
    await item.cleanup();
  }
});
