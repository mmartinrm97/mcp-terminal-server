import { spawn } from "node-pty";
import { platform } from "node:os";
import { execSync } from "node:child_process";
import type { IPty } from "node-pty";
import { OutputBuffer } from "./output-buffer.js";
import { normalizeEscapeSequences } from "../lib/utils.js";
import { renderScreen, analyzeScreen } from "./screen.js";
import { SessionEndedError } from "../types.js";
import type { SessionInfo, ScreenshotResult } from "../types.js";

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
  shellName: string;

  private isEnded = false;
  private processExitCode: number | null = null;

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
    });

    // Track process exit
    this.pty.onExit((exitInfo: { exitCode: number; signal?: number }) => {
      this.isEnded = true;
      this.processExitCode = exitInfo.exitCode;
    });
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
    return Buffer.byteLength(processed);
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
    return {
      rows: screen.rows,
      cursorRow: screen.cursorRow,
      cursorCol: screen.cursorCol,
      cols: screen.cols,
      rowsCount: screen.rowsCount,
      text: screen.text,
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
  }> {
    try {
      const result = await this.buffer.readUntil(pattern, timeoutMs, stripAnsiColors);
      return {
        ...result,
        ended: this.isEnded,
        exit_code: this.processExitCode,
        timed_out: false,
      };
    } catch (err) {
      // Check if it's a ReadTimeoutError
      if (err instanceof Error && "timedOut" in err) {
        return {
          data: (err as { partialData?: string }).partialData ?? "",
          fullOutput: this.buffer.getFullBuffer(),
          matched: "",
          ended: this.isEnded,
          exit_code: this.processExitCode,
          timed_out: true,
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

    if (platform() === "win32") {
      // Windows: kill the process tree via taskkill (signals not supported)
      this.pty.kill();
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
      } catch {
        // taskkill may fail if process already terminated — ignore
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
          this.pty.kill();
        } else {
          this.pty.kill("SIGKILL");
        }
        break;
      default:
        throw new Error(`Unknown signal: ${signal}`);
    }
    this.lastActivity = new Date();
  }

  /**
   * Get session info for listing.
   */
  getInfo(): SessionInfo {
    return {
      id: this.id,
      label: this.label,
      shell: this.shellName,
      cwd: this.cwd,
      cols: this.pty.cols,
      rows: this.pty.rows,
      created_at: this.createdAt.toISOString(),
      last_activity: this.lastActivity.toISOString(),
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
}
