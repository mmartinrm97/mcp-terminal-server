import { spawn } from 'node-pty';
import type { IPty } from 'node-pty';
import { OutputBuffer } from './output-buffer.js';
import { normalizeEscapeSequences } from './utils.js';
import { renderScreen } from './screen.js';
import type { SessionInfo } from './types.js';

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

  private _ended = false;
  private _exitCode: number | null = null;

  constructor(options: PTYSessionOptions) {
    this.id = options.id;
    this.label = options.label ?? null;
    this.cwd = options.cwd;
    this.createdAt = new Date();
    this.lastActivity = new Date();
    this.buffer = new OutputBuffer();

    // Spawn the PTY process
    this.pty = spawn(options.shell, options.args, {
      name: 'xterm-256color',
      cwd: options.cwd,
      cols: options.cols,
      rows: options.rows,
      env: options.env ?? process.env as Record<string, string>,
    });

    // Capture all data events into the buffer
    this.pty.onData((data: string) => {
      this.buffer.append(data);
    });

    // Track process exit
    this.pty.onExit((exitInfo: { exitCode: number; signal?: number }) => {
      this._ended = true;
      this._exitCode = exitInfo.exitCode;
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
    const processed = normalizeEscapeSequences(data);
    this.pty.write(processed);
    this.lastActivity = new Date();
    return Buffer.byteLength(processed);
  }

  /**
   * Resize the PTY terminal dimensions.
   */
  resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows);
  }

  /**
   * Read the current buffer content.
   * If flush is true, the buffer is cleared after reading.
   *
   * @param flush - If true, clears the buffer after returning data
   */
  read(flush?: boolean): { data: string; ended: boolean; exit_code: number | null } {
    const data = flush ? this.buffer.getFullBuffer() : this.buffer.readAll();
    if (flush) {
      this.buffer.clear();
    }
    return {
      data,
      ended: this._ended,
      exit_code: this._exitCode,
    };
  }

  /**
   * Take a screenshot of the current terminal screen.
   * Parses all raw PTY output through an ANSI-aware screen renderer
   * and returns clean, structured text rows with cursor position.
   */
  screenshot(): {
    rows: string[];
    cursorRow: number;
    cursorCol: number;
    cols: number;
    rowsCount: number;
    text: string;
  } {
    const raw = this.buffer.getFullBuffer();
    return renderScreen(raw, this.pty.cols, this.pty.rows);
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
    stripAnsiColors?: boolean
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
        ended: this._ended,
        exit_code: this._exitCode,
        timed_out: false,
      };
    } catch (err) {
      // Check if it's a ReadTimeoutError
      if (err instanceof Error && 'timedOut' in err) {
        return {
          data: (err as any).partialData ?? '',
          fullOutput: this.buffer.getFullBuffer(),
          matched: '',
          ended: this._ended,
          exit_code: this._exitCode,
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
    if (force) {
      this.pty.kill('SIGKILL');
    } else {
      this.pty.kill();
    }
    return this._exitCode;
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
      case 'SIGINT':
        this.pty.write('\x03');
        break;
      case 'SIGTSTP':
        this.pty.write('\x1a');
        break;
      case 'SIGQUIT':
        this.pty.write('\x1c');
        break;
      case 'SIGKILL':
        this.pty.kill('SIGKILL');
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
      shell: this.pty.process,
      cwd: this.cwd,
      cols: this.pty.cols,
      rows: this.pty.rows,
      created_at: this.createdAt.toISOString(),
      last_activity: this.lastActivity.toISOString(),
      alive: !this._ended,
    };
  }

  /**
   * Whether the PTY process has ended.
   */
  get ended(): boolean {
    return this._ended;
  }

  /**
   * The exit code of the PTY process, or null if still running.
   */
  get exitCode(): number | null {
    return this._exitCode;
  }
}
