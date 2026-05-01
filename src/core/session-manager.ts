import { PTYSession } from "./pty-session.js";
import { detectShell } from "../lib/shell-detector.js";
import { generateSessionId } from "../lib/utils.js";
import { SessionNotFoundError, SessionLimitError } from "../types.js";
import type { SessionConfig, SessionInfo, SessionManagerConfig } from "../types.js";

/**
 * Manages multiple PTY sessions with TTL-based cleanup.
 *
 * Features:
 * - Session creation with auto shell detection
 * - Session lookup by ID
 * - Session listing
 * - TTL-based automatic cleanup (default: 30 minutes of inactivity)
 * - Max session limit enforcement (default: 10)
 */
export class SessionManager {
  private sessions: Map<string, PTYSession> = new Map();
  private config: SessionManagerConfig;
  private cleanupTimer: ReturnType<typeof setInterval>;

  /**
   * @param config - Optional configuration override
   *   Default: max_sessions=10, session_ttl_ms=1800000 (30 min)
   */
  constructor(config?: Partial<SessionManagerConfig>) {
    this.config = {
      max_sessions: config?.max_sessions ?? 10,
      session_ttl_ms: config?.session_ttl_ms ?? 30 * 60 * 1000,
    };

    // Start cleanup timer — runs every 60 seconds
    this.cleanupTimer = setInterval(() => this.cleanupExpiredSessions(), 60_000);
  }

  /**
   * Create a new terminal session.
   *
   * - Auto-detects shell if shell='auto'
   * - Sets cwd to process.cwd() if not provided
   * - Generates a UUID id if not provided
   * - Throws SessionLimitError if max sessions reached
   */
  async createSession(config: SessionConfig): Promise<SessionInfo> {
    // Enforce session limit
    if (this.sessions.size >= this.config.max_sessions) {
      throw new SessionLimitError(this.config.max_sessions);
    }

    // Resolve shell
    const shellInfo = detectShell(config.shell ?? "auto");

    // Generate or use provided ID
    const id = config.id ?? generateSessionId();

    // Resolve cwd
    const cwd = config.cwd ?? process.cwd();

    // Default terminal size
    const cols = config.cols ?? 80;
    const rows = config.rows ?? 24;

    // Create the PTY session
    const session = new PTYSession({
      id,
      label: config.label,
      shell: shellInfo.shell,
      args: shellInfo.args,
      cwd,
      cols,
      rows,
      env: config.env,
    });

    this.sessions.set(id, session);
    return session.getInfo();
  }

  /**
   * Get a session by ID.
   * Throws SessionNotFoundError if not found.
   */
  getSession(id: string): PTYSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    return session;
  }

  /**
   * List all active sessions.
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.getInfo());
  }

  /**
   * Close a session by ID.
   *
   * @param id - Session ID
   * @param force - If true, immediate termination
   * @returns Exit code, or null
   * @throws SessionNotFoundError if session doesn't exist
   */
  closeSession(id: string, force?: boolean): number | null {
    const session = this.getSession(id);
    const exitCode = session.close(force);
    this.sessions.delete(id);
    return exitCode;
  }

  /**
   * Get the number of active sessions.
   */
  get activeCount(): number {
    return this.sessions.size;
  }

  /**
   * Clean up expired sessions (called by the cleanup timer).
   * Sessions are considered expired when their lastActivity
   * is older than session_ttl_ms.
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const ttl = this.config.session_ttl_ms;

    for (const [id, session] of this.sessions) {
      const inactiveTime = now - session.lastActivity.getTime();
      if (inactiveTime >= ttl) {
        session.close(true); // Force close
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Dispose the session manager — stops the cleanup timer and closes all sessions.
   */
  dispose(): void {
    clearInterval(this.cleanupTimer);

    for (const [, session] of this.sessions) {
      session.close(true);
    }
    this.sessions.clear();
  }
}
