import { spawn } from 'node-pty';
import type { IPty } from 'node-pty';
import { OutputBuffer } from './output-buffer.js';
import type { SessionInfo } from './types.js';
import { timestamp } from './utils.js';

/**
 * Options for creating a PTYSession.
 */
export interface PTYSessionOptions {
  id: string;
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
  readonly pty: IPty;
  readonly buffer: OutputBuffer;
  readonly createdAt: Date;
  readonly cwd: string;
  lastActivity: Date;

  private _ended = false;
  private _exitCode: number | null = null;

  constructor(options: PTYSessionOptions) {
    this.id = options.id;
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
   * - \x03 → Ctrl+C / SIGINT
   * - \x1b → Escape
   * - \t → Tab
   * All other characters are written as-is.
   *
   * @returns Number of bytes written
   */
  write(data: string): number {
    this.pty.write(data);
    this.lastActivity = new Date();
    return Buffer.byteLength(data);
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
   * Get session info for listing.
   */
  getInfo(): SessionInfo {
    return {
      id: this.id,
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
