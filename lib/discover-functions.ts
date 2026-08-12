import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { action, query, type ActionDefinition, type QueryDefinition } from "@pylonsync/sdk";
import type { FieldType, InputFieldDefinition } from "@pylonsync/sdk";

// The manifest's function half, derived from `functions/` at build time.
//
// buildManifest takes `queries` and `actions`, and app.ts passed neither — so
// /api/manifest advertised 37 entities and ZERO callable functions while 111
// were live at /api/fn/<name>. Anything generating a client from the manifest
// saw an app with no API.
//
// This is the counterpart to the SDK's own discoverAppRoutes(): read the
// directory, import each definition, and report what is actually there. A
// hand-written list would drift the first time someone adds a function.

/** A runtime function definition, as `@pylonsync/functions` builds it. */
interface RuntimeFn {
  type: "query" | "mutation" | "action";
  args?: Record<string, { type: string; optional?: boolean; table?: string }>;
  internal?: boolean;
}

/**
 * Map a runtime validator to the manifest's field vocabulary. The manifest
 * describes the wire shape a caller must send, so anything without a distinct
 * wire type (arrays, free-form objects) is reported as json rather than
 * invented.
 */
function toFieldType(validator: { type: string; table?: string }): FieldType {
  switch (validator.type) {
    case "string":
      return "string";
    case "int":
      return "int";
    case "float":
    case "number":
      return "float";
    case "bool":
    case "boolean":
      return "bool";
    case "datetime":
      return "datetime";
    case "id":
      return validator.table ? (`id(${validator.table})` as FieldType) : "string";
    default:
      return "json";
  }
}

function toInput(args: RuntimeFn["args"]): InputFieldDefinition[] {
  if (!args) return [];
  return Object.entries(args).map(([name, validator]) => ({
    name,
    type: toFieldType(validator),
    optional: validator.optional === true,
  }));
}

export interface DiscoveredFunctions {
  queries: QueryDefinition[];
  actions: ActionDefinition[];
}

/**
 * Read `functions/`, import every default-exported definition, and split it
 * into the manifest's two buckets. Mutations are reported as actions: the
 * manifest's split is read versus write, and a mutation is a write.
 *
 * `internal: true` functions are omitted on purpose — the router refuses
 * external calls to them, so listing them would describe an API that does not
 * exist.
 */
export async function discoverFunctions(dir = "functions"): Promise<DiscoveredFunctions> {
  const root = resolve(process.cwd(), dir);
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return { queries: [], actions: [] };
  }

  const queries: QueryDefinition[] = [];
  const actions: ActionDefinition[] = [];

  for (const file of entries.sort()) {
    // `_name.ts` files are shared helpers, not endpoints.
    if (!file.endsWith(".ts") || file.startsWith("_") || file.endsWith(".test.ts")) continue;
    const name = file.slice(0, -3);
    const loaded = (await import(pathToFileURL(resolve(root, file)).href)) as {
      default?: RuntimeFn;
    };
    const definition = loaded.default;
    if (!definition || typeof definition !== "object" || !definition.type) continue;
    if (definition.internal) continue;

    const input = toInput(definition.args);
    if (definition.type === "query") queries.push(query(name, { input }));
    else actions.push(action(name, { input }));
  }

  return { queries, actions };
}
