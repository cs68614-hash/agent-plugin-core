import { randomUUID } from "node:crypto";

import { JsonProjectStore } from "../server/lib/json-store.mjs";

function now() {
  return new Date().toISOString();
}

function initialState() {
  return {
    schemaVersion: 1,
    version: 0,
    updatedAt: null,
    tasks: [],
  };
}

function findTask(state, id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) throw new Error(`Task not found: ${id}`);
  return task;
}

function applyAction(state, action, input) {
  switch (action) {
    case "list_tasks": {
      const tasks = input.status
        ? state.tasks.filter((task) => task.status === input.status)
        : state.tasks;
      return { result: { tasks: structuredClone(tasks), count: tasks.length }, mutated: false };
    }
    case "create_task": {
      const timestamp = now();
      const task = {
        id: randomUUID(),
        title: input.title.trim(),
        description: input.description || "",
        status: input.status || "todo",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.tasks.push(task);
      return { result: { task: structuredClone(task) }, mutated: true };
    }
    case "update_task": {
      const task = findTask(state, input.id);
      for (const field of ["title", "description", "status"]) {
        if (input[field] !== undefined) task[field] = input[field];
      }
      task.updatedAt = now();
      return { result: { task: structuredClone(task) }, mutated: true };
    }
    case "delete_task": {
      const task = findTask(state, input.id);
      state.tasks = state.tasks.filter((item) => item.id !== input.id);
      return { result: { deletedTask: structuredClone(task) }, mutated: true };
    }
    default:
      throw new Error(`Adapter does not implement action: ${action}`);
  }
}

function assertVersion(state, expectedVersion) {
  if (expectedVersion !== undefined && state.version !== expectedVersion) {
    const error = new Error(`Version conflict: expected ${expectedVersion}, current ${state.version}. Refresh state and retry.`);
    error.code = "VERSION_CONFLICT";
    throw error;
  }
}

export function createApplicationAdapter({ config }) {
  const actions = new Map(config.actions.map((action) => [action.name, action]));
  const store = new JsonProjectStore({ storage: config.storage, initialState });

  return {
    async getCapabilities() {
      return {
        appId: config.appId,
        displayName: config.displayName,
        description: config.description,
        supports: {
          nativeWidget: true,
          dryRun: true,
          optimisticConcurrency: true,
          atomicBatch: true,
          auditEvents: true,
        },
        actions: config.actions,
      };
    },

    async getState({ projectDir }) {
      const state = await store.read(projectDir);
      return { projectDir, state, storage: store.paths(projectDir) };
    },

    async executeAction({ projectDir, action, input = {}, dryRun = false, expectedVersion }) {
      const definition = actions.get(action);
      if (!definition) throw new Error(`Unknown action: ${action}`);
      const current = await store.read(projectDir);
      assertVersion(current, expectedVersion);
      const draft = structuredClone(current);
      const applied = applyAction(draft, action, input);

      if (!applied.mutated || definition.readOnly) {
        return {
          ok: true,
          action,
          dryRun: false,
          beforeVersion: current.version,
          afterVersion: current.version,
          ...applied.result,
        };
      }

      const mutationId = randomUUID();
      draft.version = current.version + 1;
      draft.updatedAt = now();
      const response = {
        ok: true,
        action,
        dryRun,
        mutationId,
        beforeVersion: current.version,
        afterVersion: draft.version,
        ...applied.result,
      };
      if (dryRun) return { ...response, previewState: draft };

      const statePath = await store.write(projectDir, draft);
      await store.appendEvent(projectDir, {
        mutationId,
        action,
        input,
        beforeVersion: current.version,
        afterVersion: draft.version,
        timestamp: draft.updatedAt,
      });
      return { ...response, statePath };
    },

    async applyOperations({ projectDir, operations, dryRun = false, expectedVersion }) {
      const current = await store.read(projectDir);
      assertVersion(current, expectedVersion);
      const draft = structuredClone(current);
      const results = [];

      for (const operation of operations) {
        const definition = actions.get(operation.action);
        if (!definition) throw new Error(`Unknown action: ${operation.action}`);
        if (definition.readOnly) throw new Error(`Read-only action ${operation.action} cannot be used in a mutation batch.`);
        const applied = applyAction(draft, operation.action, operation.input || {});
        results.push({ action: operation.action, ...applied.result });
      }

      const mutationId = randomUUID();
      draft.version = current.version + 1;
      draft.updatedAt = now();
      const response = {
        ok: true,
        dryRun,
        atomic: true,
        mutationId,
        beforeVersion: current.version,
        afterVersion: draft.version,
        results,
      };
      if (dryRun) return { ...response, previewState: draft };

      const statePath = await store.write(projectDir, draft);
      await store.appendEvent(projectDir, {
        mutationId,
        action: "apply_app_operations",
        operations,
        beforeVersion: current.version,
        afterVersion: draft.version,
        timestamp: draft.updatedAt,
      });
      return { ...response, statePath };
    },

    async getEvents({ projectDir, sinceVersion, limit }) {
      return {
        projectDir,
        events: await store.readEvents(projectDir, { sinceVersion, limit }),
      };
    },
  };
}
