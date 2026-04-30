// Session configuration
export interface SessionConfig {
  id?: string;
  shell?: 'auto' | 'bash' | 'zsh' | 'pwsh' | 'cmd';
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

// Session info returned to clients
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

// Result of terminal_write
export interface WriteResult {
  ok: boolean;
  bytes_written: number;
}

// Result of terminal_read
export interface ReadResult {
  data: string;
  ended: boolean;
  exit_code: number | null;
}

// Result of terminal_read_until (the star tool)
export interface ReadUntilResult {
  data: string;
  full_output: string;
  matched: string | null;
  ended: boolean;
  exit_code: number | null;
  timed_out: boolean;
}

// Create session input
export interface CreateSessionInput {
  id?: string;
  shell?: 'auto' | 'bash' | 'zsh' | 'pwsh' | 'cmd';
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

// Write input
export interface WriteInput {
  id: string;
  data: string;
}

// Read input
export interface ReadInput {
  id: string;
  flush?: boolean;
}

// ReadUntil input
export interface ReadUntilInput {
  id: string;
  pattern: string;
  timeout_ms?: number;
  strip_ansi?: boolean;
}

// Resize input
export interface ResizeInput {
  id: string;
  cols: number;
  rows: number;
}

// Close session input
export interface CloseSessionInput {
  id: string;
  force?: boolean;
}

// Session Manager config
export interface SessionManagerConfig {
  max_sessions: number;
  session_ttl_ms: number;
}

// Error types
export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionLimitError extends Error {
  constructor(max: number) {
    super(`Maximum session limit reached (${max})`);
    this.name = 'SessionLimitError';
  }
}

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
