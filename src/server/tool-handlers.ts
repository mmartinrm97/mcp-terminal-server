import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

import type { SessionManager } from "../core/session-manager.js";
import {
  ReadTimeoutError,
  SessionLimitError,
  SessionNotFoundError,
  SessionPolicyError,
} from "../types.js";
import { PKG_VERSION } from "../version.js";
import type {
  ExecuteResult,
  PingResult,
  ReadResult,
  ReadUntilResult,
  ScreenshotResult,
  SessionActivitySummary,
  SessionConfig,
  SessionDiagnostics,
  TailResult,
  WriteResult,
} from "../types.js";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";
import {
  getSessionOrError,
  requireStringArg,
  textContent,
  toolError,
  type ToolResponse,
} from "./shared.js";
import { stripAnsi } from "../lib/ansi-stripper.js";
import { truncateMiddleByBytes } from "../lib/utils.js";

const serverStartTime = Date.now();
type ScreenshotVerbosity = "minimal" | "standard" | "diagnostic";

interface SessionInfoShape {
  id: string;
  label: string | null;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  alive: boolean;
  created_at?: string;
  last_activity?: string;
  last_output_at?: string | null;
  idle_ms?: number;
  output_bytes?: number;
}

interface OutputProjectionOptions {
  stripAnsi: boolean;
  maxOutputBytes?: number;
}

function projectSessionInfo(
  info: SessionDiagnostics["session"],
  verbose: boolean = false,
): SessionInfoShape {
  const base: SessionInfoShape = {
    id: info.id,
    label: info.label,
    shell: info.shell,
    cwd: info.cwd,
    cols: info.cols,
    rows: info.rows,
    alive: info.alive,
  };

  if (!verbose) {
    return base;
  }

  return {
    ...base,
    created_at: info.created_at,
    last_activity: info.last_activity,
    last_output_at: info.last_output_at,
    idle_ms: info.idle_ms,
    output_bytes: info.output_bytes,
  };
}

function projectOutput(data: string, options: OutputProjectionOptions): string {
  const normalized = options.stripAnsi ? stripAnsi(data) : data;
  if (typeof options.maxOutputBytes !== "number") {
    return normalized;
  }
  return truncateMiddleByBytes(normalized, options.maxOutputBytes);
}

function projectReadUntilResult(
  raw: Awaited<ReturnType<NonNullable<ReturnType<SessionManager["getSession"]>>["readUntil"]>>,
  options: { includeFullOutput: boolean; includeDebug: boolean } & OutputProjectionOptions,
): ReadUntilResult {
  const promptDebug = raw.debug;
  return {
    data: projectOutput(raw.data, options),
    full_output: options.includeFullOutput ? projectOutput(raw.fullOutput, options) : undefined,
    matched: raw.matched,
    ended: raw.ended,
    exit_code: raw.exit_code,
    timed_out: raw.timed_out,
    detected_prompt: raw.detected_prompt,
    prompt_category: raw.prompt_category,
    should_ask_user: raw.should_ask_user,
    ask_user_reason: raw.ask_user_reason,
    can_accept_default: raw.can_accept_default,
    recommended_next_action: raw.recommended_next_action,
    debug: options.includeDebug
      ? {
          session_id: promptDebug.session_id,
          pattern: promptDebug.pattern,
          timeout_ms: promptDebug.timeout_ms,
          idle_ms: promptDebug.idle_ms,
          last_output_at: promptDebug.last_output_at,
          output_bytes: promptDebug.output_bytes,
        }
      : undefined,
  };
}

function projectTimeoutReadUntilResult(
  partialData: string,
  screenshot: ScreenshotResult,
  context: { sessionId: string; pattern: string; timeoutMs: number },
  options: { includeFullOutput: boolean; includeDebug: boolean } & OutputProjectionOptions,
): ReadUntilResult {
  return {
    data: projectOutput(partialData, options),
    full_output: options.includeFullOutput ? projectOutput(partialData, options) : undefined,
    matched: null,
    ended: false,
    exit_code: null,
    timed_out: true,
    detected_prompt: screenshot.detectedPrompt,
    prompt_category: screenshot.promptCategory ?? null,
    should_ask_user: screenshot.shouldAskUser ?? false,
    ask_user_reason: screenshot.askUserReason ?? null,
    can_accept_default: screenshot.canAcceptDefault ?? false,
    recommended_next_action: screenshot.recommendedNextAction,
    debug: options.includeDebug
      ? {
          session_id: context.sessionId,
          pattern: context.pattern,
          timeout_ms: context.timeoutMs,
          idle_ms: screenshot.idleMs ?? 0,
          last_output_at: screenshot.lastOutputAt ?? null,
          output_bytes: screenshot.outputBytes ?? 0,
        }
      : undefined,
  };
}

function projectScreenshot(
  result: ScreenshotResult,
  verbosity: ScreenshotVerbosity,
): ScreenshotResult {
  const base: ScreenshotResult = {
    text: result.text,
    isInteractive: result.isInteractive,
    detectedPrompt: result.detectedPrompt,
    recommendedNextAction: result.recommendedNextAction,
    terminal_mode: result.terminal_mode,
    editor_mode: result.editor_mode,
  };

  if (verbosity === "minimal") {
    return base;
  }

  const standard: ScreenshotResult = {
    ...base,
    promptCategory: result.promptCategory,
    shouldAskUser: result.shouldAskUser,
    askUserReason: result.askUserReason,
    canAcceptDefault: result.canAcceptDefault,
    status_line: result.status_line,
  };

  if (verbosity === "standard") {
    return standard;
  }

  return {
    ...standard,
    cursorRow: result.cursorRow,
    cursorCol: result.cursorCol,
    cols: result.cols,
    rowsCount: result.rowsCount,
    rows: result.rows,
    content_rows: result.content_rows,
    outputBytes: result.outputBytes,
    lastOutputAt: result.lastOutputAt,
    idleMs: result.idleMs,
  };
}

function readScreenshotVerbosity(args: Record<string, unknown>): ScreenshotVerbosity {
  return args.screenshot_verbosity === "standard" || args.screenshot_verbosity === "diagnostic"
    ? (args.screenshot_verbosity as ScreenshotVerbosity)
    : "minimal";
}

function projectActivitySummary(summary: SessionActivitySummary): SessionActivitySummary {
  return {
    last_input_preview: summary.last_input_preview,
    last_output_preview: summary.last_output_preview,
    last_wait_pattern: summary.last_wait_pattern,
    last_wait_status: summary.last_wait_status,
    detected_prompt: summary.detected_prompt,
    recommended_next_action: summary.recommended_next_action,
  };
}

/**
 * Return static MCP tool metadata.
 */
export async function handleListTools() {
  return { tools: TOOL_DEFINITIONS };
}

async function handleCreateSessionTool(
  sm: SessionManager,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  try {
    const verbose = args.verbose === true;
    const info = await sm.createSession({
      id: args.id as string | undefined,
      label: args.label as string | undefined,
      shell: args.shell as SessionConfig["shell"],
      cwd: args.cwd as string | undefined,
      cols: args.cols as number | undefined,
      rows: args.rows as number | undefined,
      env: args.env as Record<string, string> | undefined,
    });
    return { content: [textContent(projectSessionInfo(info, verbose))] };
  } catch (err) {
    if (err instanceof SessionLimitError || err instanceof SessionPolicyError) {
      return toolError(err.message);
    }

    throw err;
  }
}

function handleWriteTool(sm: SessionManager, args: Record<string, unknown>): ToolResponse {
  const id = requireStringArg(args, "id");
  const data = args.data as string | undefined;
  if (typeof data !== "string") {
    throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: data");
  }

  try {
    const bytesWritten = sm.writeToSession(id, data);
    const result: WriteResult = { ok: true, bytes_written: bytesWritten };
    return { content: [textContent(result)] };
  } catch (err) {
    if (err instanceof SessionNotFoundError || err instanceof SessionPolicyError) {
      return toolError(err.message);
    }

    throw err;
  }
}

async function handleExecuteTool(
  sm: SessionManager,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  const id = requireStringArg(args, "id");
  const data = args.data as string | undefined;
  if (typeof data !== "string") {
    throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: data");
  }

  const awaitPattern =
    typeof args.await_pattern === "string" && args.await_pattern.trim() !== ""
      ? args.await_pattern
      : undefined;
  const timeoutMs = typeof args.timeout_ms === "number" ? args.timeout_ms : undefined;
  const stripAnsiOutput = args.strip_ansi !== false;
  const includeFullOutput = args.include_full_output === true;
  const includeDebug = args.include_debug === true;
  const maxOutputBytes =
    typeof args.max_output_bytes === "number" ? args.max_output_bytes : undefined;

  try {
    const bytesWritten = sm.writeToSession(id, data);
    if (!awaitPattern) {
      const result: ExecuteResult = {
        ok: true,
        bytes_written: bytesWritten,
        awaited: false,
      };
      return { content: [textContent(result)] };
    }

    const session = sm.getSession(id);
    try {
      const raw = await session.readUntil(awaitPattern, timeoutMs, stripAnsiOutput);
      const result: ExecuteResult = {
        ok: true,
        bytes_written: bytesWritten,
        awaited: true,
        read_until: projectReadUntilResult(raw, {
          includeFullOutput,
          includeDebug,
          stripAnsi: false,
          maxOutputBytes,
        }),
      };
      return { content: [textContent(result)] };
    } catch (err) {
      if (err instanceof ReadTimeoutError) {
        const screenshot = session.screenshot();
        const result: ExecuteResult = {
          ok: true,
          bytes_written: bytesWritten,
          awaited: true,
          read_until: projectTimeoutReadUntilResult(
            err.partialData,
            screenshot,
            { sessionId: id, pattern: awaitPattern, timeoutMs: timeoutMs ?? 30000 },
            {
              includeFullOutput,
              includeDebug,
              stripAnsi: stripAnsiOutput,
              maxOutputBytes,
            },
          ),
        };
        return { content: [textContent(result)] };
      }

      throw err;
    }
  } catch (err) {
    if (err instanceof SessionNotFoundError || err instanceof SessionPolicyError) {
      return toolError(err.message);
    }

    throw err;
  }
}

function handleReadTool(sm: SessionManager, args: Record<string, unknown>): ToolResponse {
  const id = requireStringArg(args, "id");
  const s = getSessionOrError(sm, id);
  if (s.error) return toolError(s.error);

  const since = typeof args.since === "number" ? args.since : undefined;
  const flush = typeof args.flush === "boolean" ? args.flush : undefined;
  const stripAnsiOutput = args.strip_ansi !== false;
  const maxOutputBytes =
    typeof args.max_output_bytes === "number" ? args.max_output_bytes : undefined;

  if (since !== undefined) {
    const result: ReadResult = s.session.read(since);
    return {
      content: [
        textContent({
          ...result,
          data: projectOutput(result.data, { stripAnsi: stripAnsiOutput, maxOutputBytes }),
        }),
      ],
    };
  }

  const result: ReadResult = s.session.read(flush);
  return {
    content: [
      textContent({
        ...result,
        data: projectOutput(result.data, { stripAnsi: stripAnsiOutput, maxOutputBytes }),
      }),
    ],
  };
}

function handleTailTool(sm: SessionManager, args: Record<string, unknown>): ToolResponse {
  const id = requireStringArg(args, "id");
  const s = getSessionOrError(sm, id);
  if (s.error) return toolError(s.error);

  const lines = typeof args.lines === "number" ? args.lines : 20;
  const stripAnsiOutput = args.strip_ansi !== false;
  const maxOutputBytes =
    typeof args.max_output_bytes === "number" ? args.max_output_bytes : undefined;
  const result: TailResult = s.session.tail(lines);
  return {
    content: [
      textContent({
        ...result,
        data: projectOutput(result.data, { stripAnsi: stripAnsiOutput, maxOutputBytes }),
      }),
    ],
  };
}

async function handleReadUntilTool(
  sm: SessionManager,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  const id = requireStringArg(args, "id");
  const pattern = args.pattern as string | undefined;
  if (!pattern || typeof pattern !== "string") {
    throw new McpError(ErrorCode.InvalidParams, "Missing required parameter: pattern");
  }

  const s = getSessionOrError(sm, id);
  if (s.error) return toolError(s.error);

  const timeoutMs = typeof args.timeout_ms === "number" ? args.timeout_ms : undefined;
  const stripAnsiOutput = args.strip_ansi !== false;
  const includeFullOutput = args.include_full_output === true;
  const includeDebug = args.include_debug === true;
  const maxOutputBytes =
    typeof args.max_output_bytes === "number" ? args.max_output_bytes : undefined;

  try {
    const raw = await s.session.readUntil(pattern, timeoutMs, stripAnsiOutput);
    const result = projectReadUntilResult(raw, {
      includeFullOutput,
      includeDebug,
      stripAnsi: false,
      maxOutputBytes,
    });
    return { content: [textContent(result)] };
  } catch (err) {
    if (err instanceof ReadTimeoutError) {
      const screenshot = s.session.screenshot();
      const result = projectTimeoutReadUntilResult(
        err.partialData,
        screenshot,
        { sessionId: id, pattern, timeoutMs: timeoutMs ?? 30000 },
        {
          includeFullOutput,
          includeDebug,
          stripAnsi: stripAnsiOutput,
          maxOutputBytes,
        },
      );
      return { content: [textContent(result)] };
    }

    throw err;
  }
}

function handleResizeTool(sm: SessionManager, args: Record<string, unknown>): ToolResponse {
  const id = requireStringArg(args, "id");
  const cols = args.cols as number | undefined;
  const rows = args.rows as number | undefined;
  if (typeof cols !== "number" || typeof rows !== "number") {
    throw new McpError(ErrorCode.InvalidParams, "Missing required parameters: cols and rows");
  }

  const s = getSessionOrError(sm, id);
  if (s.error) return toolError(s.error);

  s.session.resize(cols, rows);
  return { content: [textContent({ cols, rows })] };
}

function handleSendSignalTool(sm: SessionManager, args: Record<string, unknown>): ToolResponse {
  const id = requireStringArg(args, "id");
  const signal = args.signal as string | undefined;
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

function handlePingTool(sm: SessionManager): ToolResponse {
  const result: PingResult = {
    ok: true,
    sessions: sm.activeCount,
    uptime_ms: Date.now() - serverStartTime,
    version: PKG_VERSION,
  };
  return { content: [textContent(result)] };
}

function handleScreenshotTool(sm: SessionManager, args: Record<string, unknown>): ToolResponse {
  const id = requireStringArg(args, "id");
  const s = getSessionOrError(sm, id);
  if (s.error) return toolError(s.error);

  const verbosity =
    args.verbosity === "standard" || args.verbosity === "diagnostic"
      ? (args.verbosity as ScreenshotVerbosity)
      : "minimal";

  const result = projectScreenshot(s.session.screenshot(), verbosity);
  return { content: [textContent(result)] };
}

function handleListSessionsTool(sm: SessionManager, args: Record<string, unknown>): ToolResponse {
  const verbose = args.verbose === true;
  const sessions = sm.listSessions().map((session) => projectSessionInfo(session, verbose));
  return { content: [textContent({ sessions })] };
}

function handleSessionProjectionTool<T>(
  sm: SessionManager,
  args: Record<string, unknown>,
  reader: (session: ReturnType<SessionManager["getSession"]>, eventLimit: number) => T,
): ToolResponse {
  const id = requireStringArg(args, "id");
  const s = getSessionOrError(sm, id);
  if (s.error) return toolError(s.error);

  const eventLimit = typeof args.event_limit === "number" ? args.event_limit : 50;
  return { content: [textContent(reader(s.session, eventLimit))] };
}

function handleSessionDiagnosticsTool(
  sm: SessionManager,
  args: Record<string, unknown>,
): ToolResponse {
  const verbose = args.verbose === true;
  const screenshotVerbosity = readScreenshotVerbosity(args);
  return handleSessionProjectionTool(sm, args, (session, eventLimit) => {
    const diagnostics = session.getDiagnostics(eventLimit);
    return {
      session: projectSessionInfo(diagnostics.session, verbose),
      summary: projectActivitySummary(diagnostics.summary),
      recent_events: diagnostics.recent_events,
      last_screenshot: projectScreenshot(diagnostics.last_screenshot, screenshotVerbosity),
    };
  });
}

function handleSessionExportTool(sm: SessionManager, args: Record<string, unknown>): ToolResponse {
  const verbose = args.verbose === true;
  const screenshotVerbosity = readScreenshotVerbosity(args);
  return handleSessionProjectionTool(sm, args, (session, eventLimit) => {
    const exported = session.exportSession(eventLimit);
    return {
      session: projectSessionInfo(exported.session, verbose),
      summary: projectActivitySummary(exported.summary),
      recent_events: exported.recent_events,
      last_screenshot: projectScreenshot(exported.last_screenshot, screenshotVerbosity),
      transcript: exported.transcript,
    };
  });
}

function handleCloseSessionTool(sm: SessionManager, args: Record<string, unknown>): ToolResponse {
  const id = requireStringArg(args, "id");
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

/**
 * Dispatch an MCP tool call to the correct terminal handler.
 */
export async function handleCallTool(
  sm: SessionManager,
  params: { name: string; arguments?: Record<string, unknown> },
): Promise<ToolResponse> {
  const { name, arguments: args = {} } = params;

  switch (name) {
    case "terminal_create_session":
      return handleCreateSessionTool(sm, args);
    case "terminal_write":
      return handleWriteTool(sm, args);
    case "terminal_execute":
      return handleExecuteTool(sm, args);
    case "terminal_read":
      return handleReadTool(sm, args);
    case "terminal_tail":
      return handleTailTool(sm, args);
    case "terminal_read_until":
      return handleReadUntilTool(sm, args);
    case "terminal_resize":
      return handleResizeTool(sm, args);
    case "terminal_send_signal":
      return handleSendSignalTool(sm, args);
    case "terminal_ping":
      return handlePingTool(sm);
    case "terminal_screenshot":
      return handleScreenshotTool(sm, args);
    case "terminal_list_sessions":
      return handleListSessionsTool(sm, args);
    case "terminal_session_diagnostics":
      return handleSessionDiagnosticsTool(sm, args);
    case "terminal_session_export":
      return handleSessionExportTool(sm, args);
    case "terminal_close_session":
      return handleCloseSessionTool(sm, args);
    default:
      return toolError(`Unknown tool: ${name}`);
  }
}
