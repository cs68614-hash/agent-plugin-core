import { z } from "zod";

function applyDescription(schema, description) {
  return description ? schema.describe(description) : schema;
}

export function jsonSchemaToZod(schema = {}) {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (schema.enum.every((value) => typeof value === "string")) {
      return applyDescription(z.enum(schema.enum), schema.description);
    }
    return applyDescription(z.union(schema.enum.map((value) => z.literal(value))), schema.description);
  }
  if (Object.hasOwn(schema, "const")) {
    return applyDescription(z.literal(schema.const), schema.description);
  }

  let parsed;
  switch (schema.type) {
    case "string": {
      parsed = z.string();
      if (Number.isInteger(schema.minLength)) parsed = parsed.min(schema.minLength);
      if (Number.isInteger(schema.maxLength)) parsed = parsed.max(schema.maxLength);
      if (schema.pattern) parsed = parsed.regex(new RegExp(schema.pattern));
      break;
    }
    case "integer": {
      parsed = z.number().int();
      if (typeof schema.minimum === "number") parsed = parsed.min(schema.minimum);
      if (typeof schema.maximum === "number") parsed = parsed.max(schema.maximum);
      break;
    }
    case "number": {
      parsed = z.number();
      if (typeof schema.minimum === "number") parsed = parsed.min(schema.minimum);
      if (typeof schema.maximum === "number") parsed = parsed.max(schema.maximum);
      break;
    }
    case "boolean":
      parsed = z.boolean();
      break;
    case "array": {
      parsed = z.array(jsonSchemaToZod(schema.items || {}));
      if (Number.isInteger(schema.minItems)) parsed = parsed.min(schema.minItems);
      if (Number.isInteger(schema.maxItems)) parsed = parsed.max(schema.maxItems);
      break;
    }
    case "object": {
      const required = new Set(schema.required || []);
      const shape = {};
      for (const [key, child] of Object.entries(schema.properties || {})) {
        const childSchema = jsonSchemaToZod(child);
        shape[key] = required.has(key) ? childSchema : childSchema.optional();
      }
      parsed = z.object(shape);
      parsed = schema.additionalProperties === false ? parsed.strict() : parsed.passthrough();
      break;
    }
    default:
      parsed = z.unknown();
  }
  return applyDescription(parsed, schema.description);
}

export function actionInputSchema(action) {
  const schema = jsonSchemaToZod(action.inputSchema);
  if (!(schema instanceof z.ZodObject)) {
    throw new Error(`Action ${action.name} must define an object input schema.`);
  }
  return schema.extend({
    projectDir: z.string().trim().optional().describe("Absolute active Codex workspace path."),
    expectedVersion: z.number().int().nonnegative().optional().describe("Optimistic concurrency guard."),
    dryRun: z.boolean().optional().describe("Preview a mutation without persisting it."),
  });
}
