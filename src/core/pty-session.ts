import { spawn } from "node-pty";
import { platform } from "node:os";
import { execSync } from "node:child_process";
import type { IPty } from "node-pty";
import { OutputBuffer } from "./output-buffer.js";
import { normalizeEscapeSequences } from "../lib/utils.js";
import { renderScreen, analyzeScreen } from "./screen.js";
import { SessionEndedError } from "../types.js";
import type {
  ReadUntilDebugInfo,
  SessionDiagnostics,
  SessionEvent,
  SessionInfo,
  ScreenshotResult,
} from "../types.js";

/**
 * Environment variables merged into every PTY session to disable pagers.
 * Pagers (like `less`) require interactive terminal input and would block
 * command execution in non-interactive MCP tool calls.
 */
const pagerEnv: Record<string, string> = {
  GIT_PAGER: "cat",
  PAGER: "cat",
  TERM: "xterm-256color",
};

/** Windows shells that benefit from progress suppression. */
const windowsShells = new Set(["cmd.exe", "pwsh.exe", "pwsh"]);
const maxSessionEvents = 200;

/**
 * Options for creating a PTYSession.
 */
export interface PTYSessionOptions {
  id: string;
  label?: string;
  shell: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

/**
 * Wraps a node-pty child process with an OutputBuffer.
 *
 * Captures all PTY data events into the buffer and provides
 * synchronous read, async readUntil, write, resize, and close operations.
 */
export class PTYSession {
  readonly id: string;
  readonly label: string | null;
  readonly pty: IPty;
  readonly buffer: OutputBuffer;
  readonly createdAt: Date;
  readonly cwd: string;
  lastActivity: Date;
  lastOutputAt: Date | null;
  shellName: string;

  private isEnded = false;
  private processExitCode: number | null = null;
  private readonly events: SessionEvent[] = [];

  /**
   * Create a new PTY session.
   * Spawns a node-pty process with the given options and sets up data/exit listeners.
   *
   * @param options - Session configuration including shell, cwd, terminal size, and env
   */
  constructor(options: PTYSessionOptions) {
    this.id = options.id;
    this.label = options.label ?? null;
    this.cwd = options.cwd;
    this.createdAt = new Date();
    this.lastActivity = new Date();
    this.lastOutputAt = null;
    this.buffer = new OutputBuffer();
    this.shellName = options.shell;

    // Build env with pager-blocking defaults.
    // Order: process.env base → pagerEnv overrides → user env takes final precedence.
    const mergedEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...pagerEnv,
    };

    // Windows shells: suppress progress bars from package managers (npm, etc.)
    if (platform() === "win32" && windowsShells.has(options.shell)) {
      mergedEnv.PROGRESS_SUPPRESS = "1";
    }

    // User-provided env takes final precedence over everything
    if (options.env) {
      Object.assign(mergedEnv, options.env);
    }

    // Spawn the PTY process
    this.pty = spawn(options.shell, options.args, {
      name: "xterm-256color",
      cwd: options.cwd,
      cols: options.cols,
      rows: options.rows,
      env: mergedEnv,
    });

    // Capture all data events into the buffer
    this.pty.onData((data: string) => {
      this.buffer.append(data);
      this.lastOutputAt = new Date();
      this.recordEvent("output", {
        bytes: Buffer.byteLength(data, "utf-8"),
        preview: PTYSession.preview(data),
      });
    });

    // Track process exit
    this.pty.onExit((exitInfo: { exitCode: number; signal?: number }) => {
      this.isEnded = true;
      this.processExitCode = exitInfo.exitCode;
      this.recordEvent("exit", { exit_code: exitInfo.exitCode });
    });

    this.recordEvent("session_created");
  }

  /**
   * Write data to the PTY. Supports control sequences:
   * - \n → Enter
   * - \r → Carriage return
   * - \x03 → Ctrl+C / SIGINT
   * - \x1b → Escape
   * - \t → Tab
   *
   * Escape sequences are normalized: literal `\n` (two characters) is converted
   * to an actual newline (0x0A). This handles cases where the AI agent sends
   * unescaped escape sequences in the JSON-RPC payload.
   *
   * @returns Number of bytes written
   */
  write(data: string): number {
    let processed = normalizeEscapeSequences(data);
    // Windows shells (PowerShell, cmd.exe) require CRLF (\r\n) to execute commands.
    // A lone LF (\n) enters multiline mode (>> prompt) in PowerShell.
    if (platform() === "win32") {
      const shellProcess = this.pty.process;
      if (shellProcess) {
        // Convert LF to CRLF, but don't double-convert existing CRLF
        // This covers pwsh.exe, pwsh, powershell.exe, cmd.exe, and any Windows shell
        processed = processed.replaceAll(/(?<!\r)\n/g, "\r\n");
      }
    }
    this.pty.write(processed);
    this.lastActivity = new Date();
    const bytes = Buffer.byteLength(processed);
    this.recordEvent("write", { bytes, preview: PTYSession.preview(processed) });
    return bytes;
  }

  /**
   * Write a command wrapped with completion markers.
   *
   * Generates a unique marker, writes the command with marker wrapping,
   * and returns the marker so the caller can use readUntil(marker).
   *
   * The marker ALWAYS appears after the command, regardless of exit code.
   * Uses `;` (not `&&`) on POSIX to ensure the marker is printed even
   * when the command fails.
   *
   * Shell-specific syntax:
   * - bash/zsh: `echo MARKER; cmd; echo MARKER; echo "exit: $?"`
   * - cmd.exe:  `echo MARKER & cmd & echo MARKER & echo exit:!errorlevel!`
   * - pwsh:     `echo MARKER; cmd; echo MARKER; echo "exit: $LASTEXITCODE"`
   *
   * @throws {SessionEndedError} if the session has ended
   * @returns The marker string for readUntil matching
   */
  async writeMarked(command: string): Promise<string> {
    if (this.isEnded) {
      throw new SessionEndedError();
    }

    const marker = this.generateMarker();
    const shellProcess = this.pty.process;

    let fullCommand: string;
    if (shellProcess === "cmd.exe") {
      fullCommand = `echo ${marker} & ${command} & echo ${marker} & echo exit:!errorlevel!`;
    } else if (shellProcess === "pwsh.exe" || shellProcess === "pwsh") {
      fullCommand = `echo ${marker}; ${command}; echo ${marker}; echo "exit: $LASTEXITCODE"`;
    } else {
      // bash, zsh — POSIX: use ; so markers print even if command fails
      fullCommand = `echo ${marker}; ${command}; echo ${marker}; echo "exit: $?"`;
    }

    this.write(fullCommand + "\n");
    return marker;
  }

  /** Generate a unique completion marker for writeMarked. */
  private generateMarker(): string {
    const hex = Math.random().toString(16).slice(2, 8).padStart(6, "0");
    return `__TERM_MARK_${hex}__`;
  }

  /**
   * Resize the PTY terminal dimensions.
   */
  resize(cols: number, rows: number): void {
    if (this.isEnded) return;
    try {
      this.pty.resize(cols, rows);
      this.recordEvent("resize", { cols, rows });
    } catch {
      // Ignore resize errors on closed PTYs (common on Windows ConPTY)
    }
  }

  /**
   * Read the current buffer content.
   * If flush is true, the buffer is cleared after reading.
   * If a byte position is provided, returns only new data since that position
   * (non-destructive, for incremental reads).
   *
   * @param flushOrSince - If boolean, flush behavior. If number, byte position to read from.
   */
  read(flushOrSince?: boolean | number): {
    data: string;
    ended: boolean;
    exit_code: number | null;
    position: number;
  } {
    if (typeof flushOrSince === "number") {
      const result = this.buffer.readAll(flushOrSince) as { data: string; position: number };
      this.recordEvent("read", {
        bytes: Buffer.byteLength(result.data, "utf-8"),
        preview: PTYSession.preview(result.data),
      });
      return {
        data: result.data,
        position: result.position,
        ended: this.isEnded,
        exit_code: this.processExitCode,
      };
    }

    const flush = flushOrSince ?? false;
    const data = flush ? this.buffer.getFullBuffer() : this.buffer.readAll();
    if (flush) {
      this.buffer.clear();
    }
    this.recordEvent("read", {
      bytes: Buffer.byteLength(data, "utf-8"),
      preview: PTYSession.preview(data),
    });
    return {
      data,
      position: this.buffer.position,
      ended: this.isEnded,
      exit_code: this.processExitCode,
    };
  }

  /**
   * Take a screenshot of the current terminal screen.
   * Parses all raw PTY output through an ANSI-aware screen renderer,
   * then runs semantic analysis to classify the foreground application.
   * Returns clean, structured text rows with cursor position and
   * optional semantic fields (terminal_mode, editor_mode, status_line, content_rows).
   */
  screenshot(): ScreenshotResult {
    const raw = this.buffer.getFullBuffer();
    const screen = renderScreen(raw, this.pty.cols, this.pty.rows);
    const analysis = analyzeScreen(screen.rows);
    const idleMs = this.lastOutputAt ? Math.max(0, Date.now() - this.lastOutputAt.getTime()) : 0;
    return {
      rows: screen.rows,
      cursorRow: screen.cursorRow,
      cursorCol: screen.cursorCol,
      cols: screen.cols,
      rowsCount: screen.rowsCount,
      text: screen.text,
      outputBytes: this.buffer.position,
      lastOutputAt: this.lastOutputAt?.toISOString() ?? null,
      idleMs,
      isInteractive: analysis.is_interactive,
      detectedPrompt: analysis.prompt_detected,
      recommendedNextAction:
        analysis.prompt_detected !== null
          ? "input_required"
          : analysis.recommended_next_action === "inspect_screen"
            ? "inspect_screen"
            : idleMs < 1000
              ? "wait"
              : "read",
      terminal_mode: analysis.terminal_mode,
      editor_mode: analysis.editor_mode,
      status_line: analysis.status_line,
      content_rows: analysis.content_rows,
    };
  }

  /**
   * Read the last N lines from the buffer (like `tail -n N`).
   * Token-efficient: returns only the tail, not the entire accumulated history.
   * Does NOT change the read offset — safe to call alongside read() / readUntil().
   *
   * @param lines - Number of lines to return (default: 20)
   */
  tail(lines: number = 20): { data: string; lines: number; total_size: number } {
    const data = this.buffer.readTail(lines);
    return {
      data,
      lines,
      total_size: this.buffer.size,
    };
  }

  /**
   * Read until a pattern matches in the buffer.
   * Delegates to OutputBuffer.readUntil.
   *
   * @param pattern - Regex pattern to wait for
   * @param timeoutMs - Max wait time in milliseconds
   * @param stripAnsiColors - If true, strip ANSI codes from output
   */
  async readUntil(
    pattern: string,
    timeoutMs?: number,
    stripAnsiColors?: boolean,
  ): Promise<{
    data: string;
    fullOutput: string;
    matched: string;
    ended: boolean;
    exit_code: number | null;
    timed_out: boolean;
    debug: ReadUntilDebugInfo;
  }> {
    try {
      const result = await this.buffer.readUntil(pattern, timeoutMs, stripAnsiColors);
      this.recordEvent("read_until_match", {
        pattern,
        timeout_ms: timeoutMs ?? 30000,
        matched: result.matched,
        bytes: Buffer.byteLength(result.data, "utf-8"),
        preview: PTYSession.preview(result.data),
      });
      return {
        data: result.data,
        fullOutput: result.fullOutput,
        matched: result.matched,
        ended: this.isEnded,
        exit_code: this.processExitCode,
        timed_out: false,
        debug: this.buildReadUntilDebug(pattern, timeoutMs ?? 30000),
      };
    } catch (err) {
      // Check if it's a ReadTimeoutError
      if (err instanceof Error && "timedOut" in err) {
        const partialData = (err as { partialData?: string }).partialData ?? "";
        this.recordEvent("read_until_timeout", {
          pattern,
          timeout_ms: timeoutMs ?? 30000,
          bytes: Buffer.byteLength(partialData, "utf-8"),
          preview: PTYSession.preview(partialData),
        });
        return {
          data: partialData,
          fullOutput: this.buffer.getFullBuffer(),
          matched: "",
          ended: this.isEnded,
          exit_code: this.processExitCode,
          timed_out: true,
          debug: this.buildReadUntilDebug(pattern, timeoutMs ?? 30000),
        };
      }
      throw err;
    }
  }

  /**
   * Close the session.
   *
   * Normal: sends SIGHUP (or default signal)
   * Force: immediate kill
   *
   * @param force - If true, immediate termination
   * @returns The exit code, or null if the process hadn't exited yet
   */
  close(force?: boolean): number | null {
    if (this.isEnded) {
      return this.processExitCode;
    }

    const pid = this.pty.pid;
    this.recordEvent("close", {
      preview: force ? "force" : "graceful",
    });

    if (platform() === "win32") {
      // Windows/ConPTY: prefer taskkill directly.
      // Calling node-pty's kill() first can spawn its console-list helper, which
      // is known to emit noisy "AttachConsole failed" errors on some machines.
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
        this.isEnded = true;
      } catch {
        // Fallback: ask node-pty to tear down the session if taskkill failed.
        this.pty.kill();
      }
    } else {
      // POSIX: kill the entire process group (negative PID)
      const signal = force ? "SIGKILL" : "SIGHUP";
      try {
        process.kill(-pid, signal);
      } catch {
        // Fallback: kill just the child
        this.pty.kill(signal);
      }
    }

    return this.processExitCode;
  }

  /**
   * Send a signal to the foreground process in the terminal.
   * Translates signal names to control characters:
   * - SIGINT  → Ctrl+C (\x03)
   * - SIGTSTP → Ctrl+Z (\x1a)
   * - SIGQUIT → Ctrl+\ (\x1c)
   * - SIGKILL → force closes the session
   */
  sendSignal(signal: string): void {
    switch (signal) {
      case "SIGINT":
        this.pty.write("\x03");
        break;
      case "SIGTSTP":
        this.pty.write("\x1a");
        break;
      case "SIGQUIT":
        this.pty.write("\x1c");
        break;
      case "SIGKILL":
        if (platform() === "win32") {
          try {
            execSync(`taskkill /PID ${this.pty.pid} /T /F`, { stdio: "ignore" });
            this.isEnded = true;
          } catch {
            this.pty.kill();
          }
        } else {
          this.pty.kill("SIGKILL");
        }
        break;
      default:
        throw new Error(`Unknown signal: ${signal}`);
    }
    this.lastActivity = new Date();
    this.recordEvent("signal", { signal });
  }

  /**
   * Get session info for listing.
   */
  getInfo(): SessionInfo {
    const latestSignalAt = this.lastOutputAt ?? this.lastActivity;
    const idleMs = Math.max(0, Date.now() - latestSignalAt.getTime());
    return {
      id: this.id,
      label: this.label,
      shell: this.shellName,
      cwd: this.cwd,
      cols: this.pty.cols,
      rows: this.pty.rows,
      created_at: this.createdAt.toISOString(),
      last_activity: this.lastActivity.toISOString(),
      last_output_at: this.lastOutputAt?.toISOString() ?? null,
      idle_ms: idleMs,
      output_bytes: this.buffer.position,
      alive: !this.isEnded,
    };
  }

  /**
   * Whether the PTY process has ended.
   */
  get ended(): boolean {
    return this.isEnded;
  }

  /**
   * The exit code of the PTY process, or null if still running.
   */
  get exitCode(): number | null {
    return this.processExitCode;
  }

  /**
   * Return recent session events for diagnostics and replay-like debugging.
   */
  getRecentEvents(limit: number = 50): SessionEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Return a structured diagnostics snapshot for the current session.
   */
  getDiagnostics(limit: number = 50): SessionDiagnostics {
    return {
      session: this.getInfo(),
      recent_events: this.getRecentEvents(limit),
      last_screenshot: this.screenshot(),
    };
  }

  private recordEvent(
    type: SessionEvent["type"],
    data: Omit<SessionEvent, "at" | "type"> = {},
  ): void {
    this.events.push({
      at: new Date().toISOString(),
      type,
      ...data,
    });

    if (this.events.length > maxSessionEvents) {
      this.events.splice(0, this.events.length - maxSessionEvents);
    }
  }

  private buildReadUntilDebug(pattern: string, timeoutMs: number): ReadUntilDebugInfo {
    const screenshot = this.screenshot();
    return {
      session_id: this.id,
      pattern,
      timeout_ms: timeoutMs,
      idle_ms: screenshot.idleMs,
      last_output_at: screenshot.lastOutputAt,
      output_bytes: screenshot.outputBytes,
      detected_prompt: screenshot.detectedPrompt,
      recommended_next_action: screenshot.recommendedNextAction,
    };
  }

  private static preview(text: string, maxChars: number = 120): string {
    const normalized = text.replaceAll(/\s+/g, " ").trim();
    if (normalized.length <= maxChars) return normalized;
    return normalized.slice(0, maxChars - 1) + "…";
  }
}
