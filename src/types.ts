/**
 * Configuration for creating a new terminal session.
 */
export interface SessionConfig {
  id?: string;
  shell?: 'auto' | 'bash' | 'zsh' | 'pwsh' | 'cmd';
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
  shell?: 'auto' | 'bash' | 'zsh' | 'pwsh' | 'cmd';
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
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Error thrown when the maximum number of sessions has been reached.
 */
export class SessionLimitError extends Error {
  constructor(max: number) {
    super(`Maximum session limit reached (${max})`);
    this.name = 'SessionLimitError';
  }
}

/**
 * Error thrown when terminal_read_until times out before a pattern matches.
 */
export class ReadTimeoutError extends Error {
  public timedOut: boolean;
  public partialData: string;

  constructor(message: string, partialData: string = '') {
    super(message);
    this.name = 'ReadTimeoutError';
    this.timedOut = true;
    this.partialData = partialData;
  }
}
