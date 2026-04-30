import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock node-pty before importing our code
const mockPtyInstance = {
  pid: 12345,
  cols: 80,
  rows: 24,
  process: 'bash',
  handleFlowControl: false,
  onData: vi.fn(),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  clear: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
};

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPtyInstance),
}));

import { spawn } from 'node-pty';
import { PTYSession } from '../src/pty-session.js';

describe('PTYSession', () => {
  let session: PTYSession;
  let onDataCallback: ((data: string) => void) | null = null;
  let onExitCallback: ((exitInfo: { exitCode: number; signal?: number }) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    onDataCallback = null;
    onExitCallback = null;

    // Setup onData mock — capture and store the callback
    mockPtyInstance.onData.mockImplementation((cb: (data: string) => void) => {
      onDataCallback = cb;
      return { dispose: vi.fn() };
    });

    mockPtyInstance.onExit.mockImplementation(
      (cb: (exitInfo: { exitCode: number; signal?: number }) => void) => {
        onExitCallback = cb;
        return { dispose: vi.fn() };
      }
    );

    session = new PTYSession({
      id: 'test-session',
      shell: 'bash',
      args: [],
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    });
  });

  describe('construction', () => {
    it('should create a session with the given id', () => {
      expect(session.id).toBe('test-session');
    });

    it('should spawn a PTY process', () => {
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith('bash', [], expect.objectContaining({
        cwd: '/tmp',
        cols: 80,
        rows: 24,
      }));
    });

    it('should not be ended initially', () => {
      expect(session.ended).toBe(false);
    });

    it('should have null exit code initially', () => {
      expect(session.exitCode).toBeNull();
    });
  });

  describe('write', () => {
    it('should write data to the PTY', () => {
      session.write('hello');
      expect(mockPtyInstance.write).toHaveBeenCalledWith('hello');
    });

    it('should return the number of bytes written', () => {
      const bytes = session.write('abc');
      expect(bytes).toBe(3);
    });

    it('should update lastActivity on write', () => {
      const before = session.lastActivity.getTime();
      session.write('data');
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('read', () => {
    it('should return buffered data from PTY output', () => {
      // Simulate PTY output
      if (onDataCallback) onDataCallback('hello world');
      const result = session.read();
      expect(result.data).toBe('hello world');
      expect(result.ended).toBe(false);
      expect(result.exit_code).toBeNull();
    });

    it('should clear buffer after flush', () => {
      if (onDataCallback) onDataCallback('first');
      session.read(true); // flush
      const result = session.read();
      expect(result.data).toBe('');
    });

    it('should report ended and exit_code when process exits', () => {
      if (onExitCallback) onExitCallback({ exitCode: 0 });
      const result = session.read();
      expect(result.ended).toBe(true);
      expect(result.exit_code).toBe(0);
    });
  });

  describe('readUntil', () => {
    it('should wait for pattern match in PTY output', async () => {
      // Simulate data arriving after a short delay
      setTimeout(() => {
        if (onDataCallback) {
          onDataCallback('some output ');
          onDataCallback('PROMPT_READY');
        }
      }, 50);

      const result = await session.readUntil('PROMPT_READY', 5000);
      expect(result.matched).toBe('PROMPT_READY');
      expect(result.ended).toBe(false);
    });
  });

  describe('resize', () => {
    it('should resize the PTY', () => {
      session.resize(120, 40);
      expect(mockPtyInstance.resize).toHaveBeenCalledWith(120, 40);
    });
  });

  describe('close', () => {
    it('should kill the PTY process gracefully by default', () => {
      session.close();
      expect(mockPtyInstance.kill).toHaveBeenCalled();
    });

    it('should force kill when force=true', () => {
      session.close(true);
      expect(mockPtyInstance.kill).toHaveBeenCalled();
    });

    it('should return exit code from close', () => {
      // Set exit code before close
      if (onExitCallback) onExitCallback({ exitCode: 0 });
      const exitCode = session.close();
      expect(exitCode).toBe(0);
    });
  });

  describe('getInfo', () => {
    it('should return session metadata', () => {
      const info = session.getInfo();
      expect(info.id).toBe('test-session');
      expect(info.shell).toBe('bash');
      expect(info.cwd).toBe('/tmp');
      expect(info.cols).toBe(80);
      expect(info.rows).toBe(24);
      expect(typeof info.created_at).toBe('string');
      expect(typeof info.last_activity).toBe('string');
      expect(info.alive).toBe(true);
    });
  });

  describe('ended and exitCode', () => {
    it('should be ended after exit event', () => {
      if (onExitCallback) onExitCallback({ exitCode: 1 });
      expect(session.ended).toBe(true);
      expect(session.exitCode).toBe(1);
    });
  });
});
