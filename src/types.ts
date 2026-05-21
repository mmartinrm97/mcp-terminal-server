/**
 * Configuration for creating a new terminal session.
 */
export interface SessionConfig {
  id?: string;
  label?: string;
  shell?: "auto" | "bash" | "zsh" | "pwsh" | "cmd";
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

/**
 * Information about a terminal session returned to clients.
 */
export interface SessionInfo {
  id: string;
  label: string | null;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  created_at: string;
  last_activity: string;
  last_output_at: string | null;
  idle_ms: number;
  output_bytes: number;
  alive: boolean;
}

/**
 * Result returned by terminal_write.
 */
export interface WriteResult {
  ok: boolean;
  bytes_written: number;
}

/**
 * Result returned by terminal_read.
 */
export interface ReadResult {
  data: string;
  ended: boolean;
  exit_code: number | null;
  position: number;
}

/**
 * Result returned by terminal_read_until (the key tool for interactive flows).
 */
export interface ReadUntilResult {
  data: string;
  full_output?: string;
  matched: string | null;
  ended: boolean;
  exit_code: number | null;
  timed_out: boolean;
  detected_prompt?: string | null;
  prompt_category?: "text" | "confirm" | "choice" | "secret" | "license" | "unknown" | null;
  should_ask_user?: boolean;
  ask_user_reason?:
    | "destructive_confirmation"
    | "secret_required"
    | "license_choice"
    | "ambiguous_choice"
    | "unknown_text_without_default"
    | null;
  can_accept_default?: boolean;
  recommended_next_action?: "input_required" | "inspect_screen" | "wait" | "read" | "ask_user";
  debug?: ReadUntilDebugInfo;
}

/**
 * Additional debug context for terminal_read_until, especially useful on timeout.
 */
export interface ReadUntilDebugInfo {
  session_id: string;
  pattern: string;
  timeout_ms: number;
  idle_ms: number;
  last_output_at: string | null;
  output_bytes: number;
}

/**
 * Input parameters for terminal_create_session.
 */
export interface CreateSessionInput {
  id?: string;
  shell?: "auto" | "bash" | "zsh" | "pwsh" | "cmd";
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  verbose?: boolean;
}

/**
 * Input parameters for terminal_write.
 */
export interface WriteInput {
  id: string;
  data: string;
}

/**
 * Input parameters for terminal_read.
 */
export interface ReadInput {
  id: string;
  flush?: boolean;
  since?: number;
  strip_ansi?: boolean;
  max_output_bytes?: number;
}

/**
 * Input parameters for terminal_read_until.
 */
export interface ReadUntilInput {
  id: string;
  pattern: string;
  timeout_ms?: number;
  strip_ansi?: boolean;
  include_full_output?: boolean;
  include_debug?: boolean;
  max_output_bytes?: number;
}

/**
 * Input parameters for terminal_resize.
 */
export interface ResizeInput {
  id: string;
  cols: number;
  rows: number;
}

/**
 * Input parameters for terminal_close_session.
 */
export interface CloseSessionInput {
  id: string;
  force?: boolean;
}

/**
 * Result of terminal_screenshot.
 */
export interface ScreenshotResult {
  rows?: string[];
  cursorRow?: number;
  cursorCol?: number;
  cols?: number;
  rowsCount?: number;
  text: string;
  /** Monotonic total bytes seen in the PTY output buffer */
  outputBytes?: number;
  /** ISO timestamp of the latest PTY output chunk, or null if none observed yet */
  lastOutputAt?: string | null;
  /** Milliseconds since the latest PTY output chunk */
  idleMs?: number;
  /** Best-effort signal that the terminal is likely waiting for input */
  isInteractive: boolean;
  /** Best-effort extracted prompt or question visible on screen */
  detectedPrompt: string | null;
  /** Heuristic prompt kind, if a prompt/question is currently visible */
  promptCategory?: "text" | "confirm" | "choice" | "secret" | "license" | "unknown" | null;
  /** Whether the agent should ask the user instead of guessing the answer */
  shouldAskUser?: boolean;
  /** Why the prompt should be escalated to the user */
  askUserReason?:
    | "destructive_confirmation"
    | "secret_required"
    | "license_choice"
    | "ambiguous_choice"
    | "unknown_text_without_default"
    | null;
  /** Whether pressing Enter to accept the default looks safe/reasonable */
  canAcceptDefault?: boolean;
  /** Suggested next step for agents based on current screen state */
  recommendedNextAction: "input_required" | "inspect_screen" | "wait" | "read" | "ask_user";
  /** Semantic classification of the foreground application (optional, v0.3+) */
  terminal_mode?: string;
  /** Vim-specific editor submode: "normal" | "insert" | "visual" | "replace" | "unknown" */
  editor_mode?: string;
  /** Last non-empty rendered row; null if < 2 non-empty rows */
  status_line?: string | null;
  /** All rendered rows excluding the status line */
  content_rows?: string[];
}

/**
 * Input parameters for terminal_screenshot.
 */
export interface ScreenshotInput {
  id: string;
  verbosity?: "minimal" | "standard" | "diagnostic";
}

/**
 * Input parameters for terminal_tail.
 */
export interface TailInput {
  id: string;
  lines?: number;
  strip_ansi?: boolean;
  max_output_bytes?: number;
}

/**
 * Result of terminal_tail.
 */
export interface TailResult {
  data: string;
  lines: number;
  total_size: number;
}

/**
 * Input parameters for terminal_send_signal.
 */
export interface SendSignalInput {
  id: string;
  signal: "SIGINT" | "SIGTSTP" | "SIGQUIT" | "SIGKILL";
}

/**
 * Result of terminal_ping.
 */
export interface PingResult {
  ok: boolean;
  sessions: number;
  uptime_ms: number;
  version: string;
}

/**
 * Timeline event captured for session diagnostics.
 */
export interface SessionEvent {
  at: string;
  type:
    | "session_created"
    | "output"
    | "write"
    | "read"
    | "read_until_match"
    | "read_until_timeout"
    | "resize"
    | "signal"
    | "close"
    | "exit";
  bytes?: number;
  preview?: string;
  pattern?: string;
  timeout_ms?: number;
  matched?: string | null;
  cols?: number;
  rows?: number;
  signal?: string;
  exit_code?: number | null;
}

/**
 * Structured diagnostics snapshot for a terminal session.
 */
export interface SessionDiagnostics {
  session: SessionInfo;
  recent_events: SessionEvent[];
  last_screenshot: ScreenshotResult;
}

/**
 * Replay-friendly transcript entry derived from low-level session events.
 */
export interface SessionTranscriptEntry {
  at: string;
  kind: "input" | "output" | "wait" | "signal" | "lifecycle";
  summary: string;
  bytes?: number;
  pattern?: string;
  timeout_ms?: number;
}

/**
 * Structured export payload for issue reports and bug reproduction.
 */
export interface SessionExport {
  session: SessionInfo;
  recent_events: SessionEvent[];
  last_screenshot: ScreenshotResult;
  transcript: SessionTranscriptEntry[];
}

/**
 * Configuration for the SessionManager.
 */
export interface SessionManagerConfig {
  max_sessions: number;
  session_ttl_ms: number;
  session_max_duration_ms?: number;
  output_buffer_max_bytes?: number;
  allowed_cwd_roots?: string[];
  command_allow_patterns?: string[];
  command_deny_patterns?: string[];
}

/**
 * Error thrown when attempting to access a session that does not exist.
 */
export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

/**
 * Error thrown when the maximum number of sessions has been reached.
 */
export class SessionLimitError extends Error {
  constructor(max: number) {
    super(`Maximum session limit reached (${max})`);
    this.name = "SessionLimitError";
  }
}

/**
 * Error thrown when a configured safety policy blocks a session or command.
 */
export class SessionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionPolicyError";
  }
}

/**
 * Error thrown when terminal_read_until times out before a pattern matches.
 */
export class ReadTimeoutError extends Error {
  public timedOut: boolean;
  public partialData: string;

  constructor(message: string, partialData: string = "") {
    super(message);
    this.name = "ReadTimeoutError";
    this.timedOut = true;
    this.partialData = partialData;
  }
}

/**
 * Error thrown when attempting to write to a session that has already ended.
 */
export class SessionEndedError extends Error {
  constructor() {
    super("Session has ended");
    this.name = "SessionEndedError";
  }
}
