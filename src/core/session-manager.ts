import { PTYSession } from "./pty-session.js";
import { detectShell } from "../lib/shell-detector.js";
import { generateSessionId } from "../lib/utils.js";
import { relative, resolve } from "node:path";
import { SessionNotFoundError, SessionLimitError, SessionPolicyError } from "../types.js";
import type { SessionConfig, SessionInfo, SessionManagerConfig } from "../types.js";

const defaultConfirmPatterns = [
  String.raw`\brm\s+-rf\b`,
  String.raw`\bsudo\b`,
  String.raw`\bcurl\b.*\|\s*(sh|bash|zsh|pwsh|powershell)\b`,
  String.raw`\bwget\b`,
  String.raw`\bcurl\b`,
  String.raw`\bchmod\s+777\b`,
  String.raw`\bchown\b`,
];

const packageInstallPattern =
  /\b(?:pnpm\s+(?:add|install)\b|npm\s+(?:install|i)\b|yarn\s+add\b|bun\s+add\b)/i;

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
  private readonly sessions: Map<string, PTYSession> = new Map();
  private readonly config: SessionManagerConfig;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  /**
   * @param config - Optional configuration override
   *   Default: max_sessions=10, session_ttl_ms=1800000 (30 min)
   */
  constructor(config?: Partial<SessionManagerConfig>) {
    this.config = {
      max_sessions: config?.max_sessions ?? 10,
      session_ttl_ms: config?.session_ttl_ms ?? 30 * 60 * 1000,
      session_max_duration_ms: config?.session_max_duration_ms,
      output_buffer_max_bytes: config?.output_buffer_max_bytes ?? 1024 * 1024,
      allowed_cwd_roots: config?.allowed_cwd_roots ?? [],
      command_allow_patterns: config?.command_allow_patterns ?? [],
      command_deny_patterns: config?.command_deny_patterns ?? [],
      command_confirm_patterns: config?.command_confirm_patterns ?? [],
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

    // Reject duplicate IDs to prevent orphaned PTY sessions
    if (this.sessions.has(id)) {
      throw new Error(
        `Session ID "${id}" already exists. Use a unique ID or omit it for auto-generation.`,
      );
    }

    // Resolve cwd
    const cwd = config.cwd ?? process.cwd();
    this.assertCwdAllowed(cwd);

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
      outputBufferMaxBytes: this.config.output_buffer_max_bytes,
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
   * @returns Array of session info objects.
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
   * Write to a session after applying configured safety policies.
   */
  writeToSession(id: string, data: string): number {
    this.assertCommandAllowed(data);
    const session = this.getSession(id);
    return session.write(data);
  }

  /**
   * Get the number of active sessions.
   * @returns The number of currently open sessions.
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
    const idleTtl = this.config.session_ttl_ms;
    const maxDuration = this.config.session_max_duration_ms;

    for (const [id, session] of this.sessions) {
      const inactiveTime = now - session.latestActivityAt.getTime();
      const totalAge = now - session.createdAt.getTime();
      const exceededIdleTtl = inactiveTime >= idleTtl;
      const exceededMaxDuration = maxDuration !== undefined && totalAge >= maxDuration;

      if (exceededIdleTtl || exceededMaxDuration) {
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

  private assertCwdAllowed(cwd: string): void {
    const allowedRoots = this.config.allowed_cwd_roots ?? [];
    if (allowedRoots.length === 0) return;

    const resolvedCwd = resolve(cwd);
    const isAllowed = allowedRoots.some((root) => this.isWithinRoot(resolvedCwd, resolve(root)));
    if (!isAllowed) {
      throw new SessionPolicyError(
        `Session cwd is outside configured allowed roots: ${resolvedCwd}`,
      );
    }
  }

  private assertCommandAllowed(data: string): void {
    const normalized = data.trim();
    if (normalized === "") return;

    const denyPatterns = this.config.command_deny_patterns ?? [];
    for (const pattern of denyPatterns) {
      if (new RegExp(pattern, "i").test(normalized)) {
        throw new SessionPolicyError(`Command blocked by configured deny pattern: ${pattern}`);
      }
    }

    const allowPatterns = this.config.command_allow_patterns ?? [];
    if (allowPatterns.length === 0) {
      this.assertCommandConfirmationRequired(normalized);
      return;
    }

    const matchedAllow = allowPatterns.some((pattern) => new RegExp(pattern, "i").test(normalized));
    if (!matchedAllow) {
      throw new SessionPolicyError("Command not allowed by configured allow patterns");
    }

    this.assertCommandConfirmationRequired(normalized);
  }

  private assertCommandConfirmationRequired(command: string): void {
    if (packageInstallPattern.test(command)) {
      throw new SessionPolicyError(
        "Command requires user confirmation: package installation detected. Review the package name/version/source, confirm the install, and run pnpm audit after installation to assess vulnerabilities and transitive risk.",
      );
    }

    const confirmPatterns = [
      ...defaultConfirmPatterns,
      ...(this.config.command_confirm_patterns ?? []),
    ];
    for (const pattern of confirmPatterns) {
      if (new RegExp(pattern, "i").test(command)) {
        throw new SessionPolicyError(this.buildConfirmationMessage(command, pattern));
      }
    }
  }

  private buildConfirmationMessage(command: string, pattern: string): string {
    if (/\bcurl\b.*\|\s*(sh|bash|zsh|pwsh|powershell)\b/i.test(command)) {
      return `Command requires user confirmation: download-and-execute pattern matched (${pattern}). Remote scripts can exfiltrate secrets or irreversibly modify the host.`;
    }

    if (/\bwget\b|\bcurl\b/i.test(command)) {
      return `Command requires user confirmation: internet download detected (${pattern}). Downloaded files should be reviewed before execution.`;
    }

    if (/\brm\s+-rf\b|\bchmod\s+777\b|\bchown\b|\bsudo\b/i.test(command)) {
      return `Command requires user confirmation: risky system mutation detected (${pattern}). This may cause destructive or irreversible changes.`;
    }

    return `Command requires user confirmation: risky pattern matched (${pattern}).`;
  }

  private isWithinRoot(target: string, root: string): boolean {
    const rel = relative(root, target);
    return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !rel.startsWith("\\"));
  }
}
