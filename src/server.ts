import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";

import type { SessionManager } from "./core/session-manager.js";
import { SessionNotFoundError, SessionLimitError, ReadTimeoutError } from "./types.js";
import { PKG_VERSION } from "./version.js";
import type {
  SessionConfig,
  SessionInfo,
  WriteResult,
  ReadResult,
  ReadUntilResult,
  ScreenshotResult,
  TailResult,
  PingResult,
} from "./types.js";

// Server start timestamp (for ping/uptime)
const SERVER_START_TIME = Date.now();

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: "terminal_create_session",
    description:
      "Create a new interactive terminal session. Auto-detects shell by platform. " +
      "Returns session info including ID for subsequent calls.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Optional custom session ID. Auto-generated if omitted.",
        },
        label: {
          type: "string",
          description:
            'Human-readable label (e.g. "backend-dev", "frontend"). Makes multi-agent flows clearer.',
        },
        shell: {
          type: "string",
          enum: ["auto", "bash", "zsh", "pwsh", "cmd"],
          description: 'Shell to use. "auto" detects based on platform.',
        },
        cwd: { type: "string", description: "Working directory. Defaults to process.cwd()." },
        cols: { type: "number", description: "Terminal columns. Default: 80." },
        rows: { type: "number", description: "Terminal rows. Default: 24." },
        env: {
          type: "object",
          description: "Additional environment variables.",
          additionalProperties: { type: "string" },
        },
      },
    },
  },
  {
    name: "terminal_write",
    description: String.raw`Write text/keystrokes to the terminal session. Supports control sequences: \n (Enter), \x03 (Ctrl+C/SIGINT), \x1b (Escape), \t (Tab).`,
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID returned by terminal_create_session." },
        data: { type: "string", description: String.raw`Text data to write. Use \n for Enter.` },
      },
      required: ["id", "data"],
    },
  },
  {
    name: "terminal_read",
    description:
      "Read the current terminal buffer contents. Non-blocking — returns whatever output " +
      "has accumulated. Use flush=true to clear the buffer after reading. " +
      "Use since=<byte_position> to read from a specific byte offset (incremental reads).",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        flush: {
          type: "boolean",
          description: "If true, clears the buffer after reading. Default: false.",
        },
        since: {
          type: "number",
          description:
            "Byte position to read from (global counter). Returns data from that position " +
            "plus the current total position. Use with position from previous response for " +
            "incremental reads. Does NOT clear the buffer.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "terminal_read_until",
    description:
      "Read the terminal buffer until a regex pattern matches or timeout is reached. " +
      "THE KEY TOOL for interactive flows — wait for a prompt or question before responding.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        pattern: {
          type: "string",
          description: 'Regex pattern to wait for (e.g. "package name:").',
        },
        timeout_ms: {
          type: "number",
          description: "Max wait time in milliseconds. Default: 30000.",
        },
        strip_ansi: {
          type: "boolean",
          description: "If true, strip ANSI escape codes from output. Default: false.",
        },
      },
      required: ["id", "pattern"],
    },
  },
  {
    name: "terminal_resize",
    description: "Resize the terminal dimensions for a session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        cols: { type: "number", description: "New column count." },
        rows: { type: "number", description: "New row count." },
      },
      required: ["id", "cols", "rows"],
    },
  },
  {
    name: "terminal_tail",
    description:
      "Read the last N lines of the terminal buffer (like `tail -n N`). " +
      "Token-efficient: returns only recent output, not the full accumulated history. " +
      "Use this INSTEAD of terminal_read for long-running processes (dev servers, logs, etc.) " +
      "to avoid paying tokens for old output.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        lines: {
          type: "number",
          description: "Number of recent lines to return (default: 20).",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "terminal_send_signal",
    description:
      "Send a signal to the foreground process in the terminal. Use this INSTEAD of " +
      "terminal_write with control characters for SIGINT/Ctrl+C, SIGTSTP/Ctrl+Z, etc. " +
      "More explicit and reliable than writing raw bytes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        signal: {
          type: "string",
          enum: ["SIGINT", "SIGTSTP", "SIGQUIT", "SIGKILL"],
          description: "Signal to send. SIGINT=Ctrl+C, SIGTSTP=Ctrl+Z, SIGQUIT=Ctrl+\\",
        },
      },
      required: ["id", "signal"],
    },
  },
  {
    name: "terminal_ping",
    description:
      "Health check for the terminal server. Returns server status, active session count, " +
      "and uptime. Use this to verify the server is alive before starting work.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "terminal_screenshot",
    description:
      "Take a screenshot of the current terminal screen. Returns clean, rendered text rows " +
      "with cursor position — no raw ANSI codes. The HIGH-LEVEL alternative to terminal_read " +
      "for understanding TUI state (menus, prompts, selections). " +
      "Also includes semantic fields: terminal_mode (shell|vim|nano|htop|lazygit|less|unknown), " +
      "editor_mode (normal|insert|visual|replace|unknown), status_line, and content_rows.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
      },
      required: ["id"],
    },
  },
  {
    name: "terminal_list_sessions",
    description:
      "List all active terminal sessions. Use verbose=true to include last activity timestamps.",
    inputSchema: {
      type: "object" as const,
      properties: {
        verbose: {
          type: "boolean",
          description: "If true, includes last activity timestamps. Default: false.",
        },
      },
    },
  },
  {
    name: "terminal_close_session",
    description:
      "Close a terminal session and free its resources. Use force=true for immediate SIGKILL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        force: {
          type: "boolean",
          description: "If true, sends SIGKILL immediately. Default: false (graceful SIGHUP).",
        },
      },
      required: ["id"],
    },
  },
];

// ---------------------------------------------------------------------------
// Resource definitions
// ---------------------------------------------------------------------------

const RESOURCE_DEFINITIONS = [
  {
    uri: "terminal://sessions",
    name: "Active Sessions",
    description: "JSON list of all active terminal sessions.",
    mimeType: "application/json",
  },
  {
    uri: "terminal://sessions/{id}/buffer",
    name: "Session Buffer",
    description: "Full buffer contents of a specific terminal session.",
    mimeType: "application/json",
  },
  {
    uri: "terminal://sessions/{id}/status",
    name: "Session Status",
    description: "Status information for a specific terminal session.",
    mimeType: "application/json",
  },
];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Return a JSON string as an MCP text content item. */
function textContent(data: unknown): { type: "text"; text: string } {
  return { type: "text" as const, text: JSON.stringify(data) };
}

/** Build an MCP error response for tool calls (isError: true). */
function toolError(message: string) {
  return {
    content: [textContent({ error: message })],
    isError: true as const,
  };
}

/** Get a session or return an error tool response. */
function getSessionOrError(
  sm: SessionManager,
  id: string,
): { session: ReturnType<SessionManager["getSession"]>; error: string | null } {
  try {
    return { session: sm.getSession(id), error: null };
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return { session: null as any, error: err.message };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Exported handler functions (testable pure functions)
// ---------------------------------------------------------------------------

export async function handleListTools() {
  return { tools: TOOL_DEFINITIONS };
}

export async function handleCallTool(
  sm: SessionManager,
  params: { name: string; arguments?: Record<string, unknown> },
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { name, arguments: args = {} } = params;

  switch (name) {
    // ---- terminal_create_session ----
    case "terminal_create_session": {
      try {
        const info = await sm.createSession({
          id: args.id as string | undefined,
          label: args.label as string | undefined,
          shell: args.shell as SessionConfig["shell"],
          cwd: args.cwd as string | undefined,
          cols: args.cols as number | undefined,
          rows: args.rows as number | undefined,
          env: args.env as Record<string, string> | undefined,
        });
        return { content: [textContent(info)] };
      } catch (err) {
        if (err instanceof SessionLimitError) {
          return toolError(err.message);
        }
        throw err;
      }
    }

    // ---- terminal_write ----
    case "terminal_write": {
      const id = args.id as string | undefined;
      const data = args.data as string | undefined;

      if (!id || typeof id !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: id");
      }
      if (typeof data !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: data");
      }

      const s = getSessionOrError(sm, id);
      if (s.error) return toolError(s.error);

      const bytesWritten = s.session.write(data);
      const result: WriteResult = { ok: true, bytes_written: bytesWritten };
      return { content: [textContent(result)] };
    }

    // ---- terminal_read ----
    case "terminal_read": {
      const id = args.id as string | undefined;
      if (!id || typeof id !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: id");
      }

      const s = getSessionOrError(sm, id);
      if (s.error) return toolError(s.error);

      const since = typeof args.since === "number" ? args.since : undefined;
      const flush = typeof args.flush === "boolean" ? args.flush : undefined;

      if (since !== undefined) {
        const result: ReadResult = s.session.read(since);
        return { content: [textContent(result)] };
      }

      const result: ReadResult = s.session.read(flush);
      return { content: [textContent(result)] };
    }

    // ---- terminal_tail ----
    case "terminal_tail": {
      const id = args.id as string | undefined;
      if (!id || typeof id !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: id");
      }

      const s = getSessionOrError(sm, id);
      if (s.error) return toolError(s.error);

      const lines = typeof args.lines === "number" ? args.lines : 20;
      const result: TailResult = s.session.tail(lines);
      return { content: [textContent(result)] };
    }

    // ---- terminal_read_until ----
    case "terminal_read_until": {
      const id = args.id as string | undefined;
      const pattern = args.pattern as string | undefined;

      if (!id || typeof id !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: id");
      }
      if (!pattern || typeof pattern !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: pattern");
      }

      const s = getSessionOrError(sm, id);
      if (s.error) return toolError(s.error);

      const timeoutMs = typeof args.timeout_ms === "number" ? args.timeout_ms : undefined;
      const stripAnsi = typeof args.strip_ansi === "boolean" ? args.strip_ansi : undefined;

      try {
        const raw = await s.session.readUntil(pattern, timeoutMs, stripAnsi);
        const result: ReadUntilResult = {
          data: raw.data,
          full_output: raw.fullOutput,
          matched: raw.matched,
          ended: raw.ended,
          exit_code: raw.exit_code,
          timed_out: raw.timed_out,
        };
        return { content: [textContent(result)] };
      } catch (err) {
        if (err instanceof ReadTimeoutError) {
          const result: ReadUntilResult = {
            data: err.partialData,
            full_output: "",
            matched: null,
            ended: false,
            exit_code: null,
            timed_out: true,
          };
          return { content: [textContent(result)] };
        }
        throw err;
      }
    }

    // ---- terminal_resize ----
    case "terminal_resize": {
      const id = args.id as string | undefined;
      const cols = args.cols as number | undefined;
      const rows = args.rows as number | undefined;

      if (!id || typeof id !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: id");
      }
      if (typeof cols !== "number" || typeof rows !== "number") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameters: cols and rows");
      }

      const s = getSessionOrError(sm, id);
      if (s.error) return toolError(s.error);

      s.session.resize(cols, rows);
      return { content: [textContent({ cols, rows })] };
    }

    // ---- terminal_send_signal ----
    case "terminal_send_signal": {
      const id = args.id as string | undefined;
      const signal = args.signal as string | undefined;

      if (!id || typeof id !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: id");
      }
      if (!signal || typeof signal !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: signal");
      }

      const s = getSessionOrError(sm, id);
      if (s.error) return toolError(s.error);

      try {
        s.session.sendSignal(signal);
        return { content: [textContent({ ok: true, signal })] };
      } catch (err) {
        return toolError((err as Error).message);
      }
    }

    // ---- terminal_ping ----
    case "terminal_ping": {
      const sessions = sm.activeCount;
      const uptime = Date.now() - SERVER_START_TIME;
      const result: PingResult = {
        ok: true,
        sessions,
        uptime_ms: uptime,
        version: PKG_VERSION,
      };
      return { content: [textContent(result)] };
    }

    // ---- terminal_screenshot ----
    case "terminal_screenshot": {
      const id = args.id as string | undefined;
      if (!id || typeof id !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: id");
      }

      const s = getSessionOrError(sm, id);
      if (s.error) return toolError(s.error);

      const result: ScreenshotResult = s.session.screenshot();
      return { content: [textContent(result)] };
    }

    // ---- terminal_list_sessions ----
    case "terminal_list_sessions": {
      const sessions = sm.listSessions();
      return { content: [textContent({ sessions })] };
    }

    // ---- terminal_close_session ----
    case "terminal_close_session": {
      const id = args.id as string | undefined;
      if (!id || typeof id !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: id");
      }

      const force = typeof args.force === "boolean" ? args.force : false;

      try {
        const exitCode = sm.closeSession(id, force);
        return { content: [textContent({ ok: true, exit_code: exitCode })] };
      } catch (err) {
        if (err instanceof SessionNotFoundError) {
          return toolError(err.message);
        }
        throw err;
      }
    }

    // ---- unknown ----
    default:
      return toolError(`Unknown tool: ${name}`);
  }
}

export async function handleListResources() {
  return { resources: RESOURCE_DEFINITIONS };
}

export async function handleReadResource(
  sm: SessionManager,
  params: { uri: string },
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  const { uri } = params;

  // terminal://sessions — list all sessions
  if (uri === "terminal://sessions") {
    const sessions = sm.listSessions();
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(sessions),
        },
      ],
    };
  }

  // terminal://sessions/{id}/buffer
  const bufferMatch = uri.match(/^terminal:\/\/sessions\/(.+)\/buffer$/);
  if (bufferMatch) {
    const id = bufferMatch[1];
    const s = getSessionOrError(sm, id);
    if (s.error) {
      throw new McpError(ErrorCode.InvalidRequest, s.error);
    }
    const readResult: ReadResult = s.session.read(false);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(readResult),
        },
      ],
    };
  }

  // terminal://sessions/{id}/status
  const statusMatch = uri.match(/^terminal:\/\/sessions\/(.+)\/status$/);
  if (statusMatch) {
    const id = statusMatch[1];
    const s = getSessionOrError(sm, id);
    if (s.error) {
      throw new McpError(ErrorCode.InvalidRequest, s.error);
    }
    const info: SessionInfo = s.session.getInfo();
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(info),
        },
      ],
    };
  }

  throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
}

// ---------------------------------------------------------------------------
// createTerminalServer — wires SDK Server with handlers
// ---------------------------------------------------------------------------

export function createTerminalServer(sessionManager: SessionManager): Server {
  const server = new Server(
    {
      name: "terminalize",
      version: PKG_VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return handleListTools();
  });

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleCallTool(sessionManager, {
      name,
      arguments: args,
    });
  });

  // List resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return handleListResources();
  });

  // Read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return handleReadResource(sessionManager, { uri: request.params.uri });
  });

  return server;
}
