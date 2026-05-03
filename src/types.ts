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
  full_output: string;
  matched: string | null;
  ended: boolean;
  exit_code: number | null;
  timed_out: boolean;
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
}

/**
 * Input parameters for terminal_read_until.
 */
export interface ReadUntilInput {
  id: string;
  pattern: string;
  timeout_ms?: number;
  strip_ansi?: boolean;
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
  rows: string[];
  cursorRow: number;
  cursorCol: number;
  cols: number;
  rowsCount: number;
  text: string;
}

/**
 * Input parameters for terminal_tail.
 */
export interface TailInput {
  id: string;
  lines?: number;
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
 * Configuration for the SessionManager.
 */
export interface SessionManagerConfig {
  max_sessions: number;
  session_ttl_ms: number;
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
