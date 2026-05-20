import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

import type { SessionManager } from "../core/session-manager.js";
import { PKG_VERSION } from "../version.js";
import { handleBufferResource, handleEventsResource, handleExportResource, handleStatusResource } from "./resource-handlers.js";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";
import { handleCallTool } from "./tool-handlers.js";

/**
 * Create and wire the terminal MCP server with tools and resources.
 */
export function createTerminalServer(sessionManager: SessionManager): McpServer {
  const server = new McpServer(
    { name: "terminalize", version: PKG_VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );

  for (const def of TOOL_DEFINITIONS) {
    const zodSchema = z.fromJSONSchema(def.inputSchema as never);
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: zodSchema,
      },
      async (args: unknown) =>
        handleCallTool(sessionManager, {
          name: def.name,
          arguments: (args as Record<string, unknown> | undefined) ?? {},
        }),
    );
  }

  server.registerResource(
    "Active Sessions",
    "terminal://sessions",
    {
      description: "JSON list of all active terminal sessions.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(sessionManager.listSessions()),
        },
      ],
    }),
  );

  server.registerResource(
    "Session Buffer",
    new ResourceTemplate("terminal://sessions/{id}/buffer", { list: undefined }),
    {
      description: "Full buffer contents of a specific terminal session.",
      mimeType: "application/json",
    },
    (uri, variables) => handleBufferResource(sessionManager, uri, variables),
  );

  server.registerResource(
    "Session Status",
    new ResourceTemplate("terminal://sessions/{id}/status", { list: undefined }),
    {
      description: "Status information for a specific terminal session.",
      mimeType: "application/json",
    },
    (uri, variables) => handleStatusResource(sessionManager, uri, variables),
  );

  server.registerResource(
    "Session Events",
    new ResourceTemplate("terminal://sessions/{id}/events", { list: undefined }),
    {
      description: "Recent timeline events for a specific terminal session.",
      mimeType: "application/json",
    },
    (uri, variables) => handleEventsResource(sessionManager, uri, variables),
  );

  server.registerResource(
    "Session Export",
    new ResourceTemplate("terminal://sessions/{id}/export", { list: undefined }),
    {
      description: "Structured diagnostics export for a specific terminal session.",
      mimeType: "application/json",
    },
    (uri, variables) => handleExportResource(sessionManager, uri, variables),
  );

  return server;
}
