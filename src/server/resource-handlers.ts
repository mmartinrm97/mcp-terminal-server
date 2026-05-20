import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

import type { SessionManager } from "../core/session-manager.js";
import type { ReadResult, SessionInfo } from "../types.js";
import { getSessionOrError, readSessionJsonResource, type ResourceResponse } from "./shared.js";
import { RESOURCE_DEFINITIONS } from "./resource-definitions.js";

/**
 * Return static MCP resource metadata.
 */
export async function handleListResources() {
  return { resources: RESOURCE_DEFINITIONS };
}

/**
 * Read a resource URI from the terminal server.
 */
export async function handleReadResource(
  sm: SessionManager,
  params: { uri: string },
): Promise<ResourceResponse> {
  const { uri } = params;

  if (uri === "terminal://sessions") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(sm.listSessions()),
        },
      ],
    };
  }

  const bufferMatch = /^terminal:\/\/sessions\/(.+)\/buffer$/.exec(uri);
  if (bufferMatch) {
    const id = bufferMatch[1];
    const s = getSessionOrError(sm, id);
    if (s.error) throw new McpError(ErrorCode.InvalidRequest, s.error);
    const readResult: ReadResult = s.session.read(false);
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(readResult) }],
    };
  }

  const statusMatch = /^terminal:\/\/sessions\/(.+)\/status$/.exec(uri);
  if (statusMatch) {
    const id = statusMatch[1];
    const s = getSessionOrError(sm, id);
    if (s.error) throw new McpError(ErrorCode.InvalidRequest, s.error);
    const info: SessionInfo = s.session.getInfo();
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(info) }],
    };
  }

  const eventsMatch = /^terminal:\/\/sessions\/(.+)\/events$/.exec(uri);
  if (eventsMatch) {
    const id = eventsMatch[1];
    const s = getSessionOrError(sm, id);
    if (s.error) throw new McpError(ErrorCode.InvalidRequest, s.error);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ events: s.session.getRecentEvents() }),
        },
      ],
    };
  }

  const exportMatch = /^terminal:\/\/sessions\/(.+)\/export$/.exec(uri);
  if (exportMatch) {
    const id = exportMatch[1];
    const s = getSessionOrError(sm, id);
    if (s.error) throw new McpError(ErrorCode.InvalidRequest, s.error);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(s.session.exportSession()),
        },
      ],
    };
  }

  throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
}

/** Respond to a read on a session buffer resource template. */
export async function handleBufferResource(
  sm: SessionManager,
  uri: URL,
  variables: Record<string, string | string[]>,
): Promise<ResourceResponse> {
  return readSessionJsonResource(sm, uri, variables, (session) => session.read(false));
}

/** Respond to a read on a session status resource template. */
export async function handleStatusResource(
  sm: SessionManager,
  uri: URL,
  variables: Record<string, string | string[]>,
): Promise<ResourceResponse> {
  return readSessionJsonResource(sm, uri, variables, (session) => session.getInfo());
}

/** Respond to a read on a session events resource template. */
export async function handleEventsResource(
  sm: SessionManager,
  uri: URL,
  variables: Record<string, string | string[]>,
): Promise<ResourceResponse> {
  return readSessionJsonResource(sm, uri, variables, (session) => ({
    events: session.getRecentEvents(),
  }));
}

/** Respond to a read on a session export resource template. */
export async function handleExportResource(
  sm: SessionManager,
  uri: URL,
  variables: Record<string, string | string[]>,
): Promise<ResourceResponse> {
  return readSessionJsonResource(sm, uri, variables, (session) => session.exportSession());
}
