import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

import type { SessionManager } from "../core/session-manager.js";
import { SessionNotFoundError } from "../types.js";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolResponse {
  [key: string]: unknown;
  content: TextContent[];
  isError?: boolean;
}

export interface JsonResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export interface ResourceResponse {
  [key: string]: unknown;
  contents: JsonResourceContent[];
}

/** Return a JSON string as an MCP text content item. */
export function textContent(data: unknown): TextContent {
  return { type: "text", text: JSON.stringify(data) };
}

/** Build an MCP error response for tool calls (isError: true). */
export function toolError(message: string): ToolResponse {
  return {
    content: [textContent({ error: message })],
    isError: true,
  };
}

/** Get a session or return a structured lookup result. */
export function getSessionOrError(
  sm: SessionManager,
  id: string,
): { session: ReturnType<SessionManager["getSession"]>; error: string | null } {
  try {
    return { session: sm.getSession(id), error: null };
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return { session: null as never, error: err.message };
    }

    throw err;
  }
}

/** Read and validate a required string argument from a tool payload. */
export function requireStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new McpError(ErrorCode.InvalidParams, `Missing required parameter: ${key}`);
  }

  return value;
}

/** Build a JSON resource payload. */
export function buildJsonResourceContents(uri: URL | string, data: unknown): ResourceResponse {
  return {
    contents: [
      {
        uri: uri.toString(),
        mimeType: "application/json",
        text: JSON.stringify(data),
      },
    ],
  };
}

/** Read a session-scoped resource and serialize it as JSON. */
export function readSessionJsonResource<T>(
  sm: SessionManager,
  uri: URL,
  variables: Record<string, string | string[]>,
  reader: (session: ReturnType<SessionManager["getSession"]>) => T,
): ResourceResponse {
  const id = variables.id as string;
  const s = getSessionOrError(sm, id);
  if (s.error) throw new McpError(ErrorCode.InvalidRequest, s.error);
  return buildJsonResourceContents(uri, reader(s.session));
}
