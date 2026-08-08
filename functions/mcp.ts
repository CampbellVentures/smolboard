import { action, v } from "@pylonsync/functions";
import { AGENT_TOOLS, toolByName } from "../lib/agent-tools";

// MCP server (SPEC → Differentiators #2): the SAME tool belt as the in-app
// copilot, exposed over the Model Context Protocol so organizers can run
// their CFP from Claude Code / Claude Desktop / any MCP client.
//
//   claude mcp add smolboard --transport http \
//     https://<your-app>/api/fn/mcp --header "Authorization: Bearer pk...."
//
// Transport: MCP streamable-HTTP is JSON-RPC over POST — and a Pylon action
// IS a JSON POST endpoint, so the JSON-RPC envelope maps directly onto the
// action's args (jsonrpc/id/method/params). Auth is the framework's API keys
// (mint one at /api/auth/api-keys): the request runs AS the minting
// organizer, and every tool re-checks membership itself — an MCP client can
// never do more than its human could.
//
// Event scope: unlike the in-app copilot (whose pane knows the current
// event), MCP tools take eventId explicitly; the extra list_events tool is
// the discovery step.

const PROTOCOL_VERSION = "2025-03-26";

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function mcpTools(): McpTool[] {
  const withEventId = (schema: Record<string, unknown>): Record<string, unknown> => {
    const props = { ...((schema.properties as Record<string, unknown>) ?? {}) };
    props.eventId = { type: "string", description: "Event id (from list_events)" };
    const required = [...new Set([...((schema.required as string[]) ?? []), "eventId"])];
    return { ...schema, properties: props, required };
  };
  return [
    {
      name: "list_events",
      description: "List your workspace's events with their eventIds — call this first.",
      inputSchema: { type: "object", properties: {} },
    },
    ...AGENT_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: withEventId(t.input_schema),
    })),
  ];
}

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export default action<
  { jsonrpc?: string; id?: unknown; method: string; params?: Record<string, unknown> },
  unknown
>({
  args: {
    jsonrpc: v.optional(v.string()),
    id: v.optional(v.any()),
    method: v.string(),
    params: v.optional(v.json()),
  },
  async handler(ctx, args) {
    const { id, method } = args;
    const params = (args.params ?? {}) as Record<string, unknown>;

    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "smolboard", version: "0.1.0" },
          instructions:
            "smolboard speaker & CFP management. Call list_events first to get an eventId, then run the CFP: list/review submissions, accept with emails, schedule with conflict checks, nudge speakers.",
        });
      case "notifications/initialized":
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: mcpTools() });
      case "tools/call": {
        const name = params.name as string;
        const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
        try {
          let result: unknown;
          if (name === "list_events") {
            result = await ctx.runQuery("agentListEvents", {});
          } else {
            const def = toolByName(name);
            if (!def) return rpcError(id, -32602, `Unknown tool: ${name}`);
            result =
              def.kind === "query"
                ? await ctx.runQuery(def.fn, toolArgs)
                : await ctx.runMutation(def.fn, toolArgs);
          }
          return rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        } catch (e) {
          return rpcResult(id, {
            content: [
              { type: "text", text: e instanceof Error ? e.message : String(e) },
            ],
            isError: true,
          });
        }
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  },
});
