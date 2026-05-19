import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock node-pty before importing our code
const mockPtyInstance = {
  pid: 12345,
  cols: 80,
  rows: 24,
  process: "bash",
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

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => mockPtyInstance),
}));

// Default: mock platform as "linux" (POSIX) so process.kill path is taken.
// Individual tests can override with mockReturnValue("win32").
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    platform: vi.fn(() => "linux"),
  };
});

// Mock child_process.execSync for Windows taskkill tests
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { spawn } from "node-pty";
import { platform } from "node:os";
import { execSync } from "node:child_process";
import { PTYSession } from "../../src/core/pty-session.js";

describe("PTYSession", () => {
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
      },
    );

    session = new PTYSession({
      id: "test-session",
      shell: "bash",
      args: [],
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    });
  });

  describe("construction", () => {
    it("should create a session with the given id", () => {
      expect(session.id).toBe("test-session");
    });

    it("should spawn a PTY process", () => {
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith(
        "bash",
        [],
        expect.objectContaining({
          cwd: "/tmp",
          cols: 80,
          rows: 24,
        }),
      );
    });

    it("should not be ended initially", () => {
      expect(session.ended).toBe(false);
    });

    it("should have null exit code initially", () => {
      expect(session.exitCode).toBeNull();
    });
  });

  describe("write", () => {
    it("should write data to the PTY", () => {
      session.write("hello");
      expect(mockPtyInstance.write).toHaveBeenCalledWith("hello");
    });

    it("should return the number of bytes written", () => {
      const bytes = session.write("abc");
      expect(bytes).toBe(3);
    });

    it("should update lastActivity on write", () => {
      const before = session.lastActivity.getTime();
      session.write("data");
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("should normalize escape sequences before sending to pty", () => {
      session.write("echo hello\\n");
      // The mock should receive the normalized version (real newline)
      expect(mockPtyInstance.write).toHaveBeenCalledWith("echo hello\n");
    });

    it("should normalize Ctrl+C escape before sending to pty", () => {
      session.write("\\x03");
      expect(mockPtyInstance.write).toHaveBeenCalledWith("\x03");
    });
  });

  describe("write (CRLF conversion on Windows)", () => {
    it("should convert LF to CRLF on Windows", () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValue("win32");

      const winSession = new PTYSession({
        id: "crlf-test",
        shell: "cmd.exe",
        args: [],
        cwd: "C:\\",
        cols: 80,
        rows: 24,
      });

      mockPtyInstance.process = "cmd.exe";
      winSession.write("echo hello\n");
      const lastCall = mockPtyInstance.write.mock.lastCall?.[0];
      expect(lastCall).toBe("echo hello\r\n");

      (platform as ReturnType<typeof vi.fn>).mockReturnValue("linux");
    });

    it("should not double-convert existing CRLF on Windows", () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValue("win32");

      const winSession = new PTYSession({
        id: "crlf-test-2",
        shell: "cmd.exe",
        args: [],
        cwd: "C:\\",
        cols: 80,
        rows: 24,
      });

      mockPtyInstance.process = "cmd.exe";
      winSession.write("line1\r\nline2\n");
      const lastCall = mockPtyInstance.write.mock.lastCall?.[0];
      expect(lastCall).toBe("line1\r\nline2\r\n");

      (platform as ReturnType<typeof vi.fn>).mockReturnValue("linux");
    });

    it("should skip CRLF conversion on non-Windows", () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValue("linux");

      const unixSession = new PTYSession({
        id: "unix-crlf-test",
        shell: "bash",
        args: [],
        cwd: "/tmp",
        cols: 80,
        rows: 24,
      });

      unixSession.write("echo hello\n");
      expect(mockPtyInstance.write).toHaveBeenCalledWith("echo hello\n");
    });
  });

  describe("read", () => {
    it("should return buffered data from PTY output", () => {
      // Simulate PTY output
      if (onDataCallback) onDataCallback("hello world");
      const result = session.read();
      expect(result.data).toBe("hello world");
      expect(result.ended).toBe(false);
      expect(result.exit_code).toBeNull();
    });

    it("should clear buffer after flush", () => {
      if (onDataCallback) onDataCallback("first");
      session.read(true); // flush
      const result = session.read();
      expect(result.data).toBe("");
    });

    it("should report ended and exit_code when process exits", () => {
      if (onExitCallback) onExitCallback({ exitCode: 0 });
      const result = session.read();
      expect(result.ended).toBe(true);
      expect(result.exit_code).toBe(0);
    });
  });

  describe("readUntil", () => {
    it("should wait for pattern match in PTY output", async () => {
      // Simulate data arriving after a short delay
      setTimeout(() => {
        if (onDataCallback) {
          onDataCallback("some output ");
          onDataCallback("PROMPT_READY");
        }
      }, 50);

      const result = await session.readUntil("PROMPT_READY", 5000);
      expect(result.matched).toBe("PROMPT_READY");
      expect(result.ended).toBe(false);
      expect(result.debug?.session_id).toBe("test-session");
      expect(result.debug?.pattern).toBe("PROMPT_READY");
    });
  });

  describe("resize", () => {
    it("should resize the PTY", () => {
      session.resize(120, 40);
      expect(mockPtyInstance.resize).toHaveBeenCalledWith(120, 40);
    });
  });

  describe("close", () => {
    it("should kill the PTY process gracefully by default", () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {});
      session.close();
      expect(killSpy).toHaveBeenCalled();
      killSpy.mockRestore();
    });

    it("should force kill when force=true", () => {
      session.close(true);
      expect(mockPtyInstance.kill).toHaveBeenCalled();
    });

    it("should return exit code from close", () => {
      // Set exit code before close
      if (onExitCallback) onExitCallback({ exitCode: 0 });
      const exitCode = session.close();
      expect(exitCode).toBe(0);
    });
  });

  describe("getInfo", () => {
    it("should return session metadata", () => {
      const info = session.getInfo();
      expect(info.id).toBe("test-session");
      expect(info.shell).toBe("bash");
      expect(info.cwd).toBe("/tmp");
      expect(info.cols).toBe(80);
      expect(info.rows).toBe(24);
      expect(typeof info.created_at).toBe("string");
      expect(typeof info.last_activity).toBe("string");
      expect(info.last_output_at).toBeNull();
      expect(typeof info.idle_ms).toBe("number");
      expect(info.output_bytes).toBe(0);
      expect(info.alive).toBe(true);
    });
  });

  describe("screenshot", () => {
    it("should return semantic interaction hints for prompts", () => {
      if (onDataCallback) onDataCallback("package name: (demo)");

      const result = session.screenshot();

      expect(result.detectedPrompt).toContain("package name:");
      expect(result.isInteractive).toBe(true);
      expect(result.recommendedNextAction).toBe("input_required");
      expect(result.outputBytes).toBeGreaterThan(0);
      expect(result.lastOutputAt).not.toBeNull();
      expect(typeof result.idleMs).toBe("number");
      expect(result.promptCategory).toBe("text");
      expect(result.shouldAskUser).toBe(false);
      expect(result.canAcceptDefault).toBe(true);
    });

    it("should surface ask-user guidance for sensitive prompts", () => {
      if (onDataCallback) onDataCallback("Password:");

      const result = session.screenshot();

      expect(result.detectedPrompt).toBe("Password:");
      expect(result.promptCategory).toBe("secret");
      expect(result.shouldAskUser).toBe(true);
      expect(result.askUserReason).toBe("secret_required");
      expect(result.recommendedNextAction).toBe("ask_user");
    });
  });

  describe("diagnostics", () => {
    it("should capture a recent event timeline", () => {
      if (onDataCallback) onDataCallback("hello");
      session.write("echo hi");
      session.read();

      const events = session.getRecentEvents();
      expect(events.some((e) => e.type === "session_created")).toBe(true);
      expect(events.some((e) => e.type === "output")).toBe(true);
      expect(events.some((e) => e.type === "write")).toBe(true);
      expect(events.some((e) => e.type === "read")).toBe(true);
    });

    it("should return structured diagnostics snapshot", () => {
      if (onDataCallback) onDataCallback("package name: (demo)");

      const diagnostics = session.getDiagnostics(10);
      expect(diagnostics.session.id).toBe("test-session");
      expect(diagnostics.recent_events.length).toBeGreaterThan(0);
      expect(diagnostics.last_screenshot.detectedPrompt).toContain("package name:");
    });
  });

  describe("ended and exitCode", () => {
    it("should be ended after exit event", () => {
      if (onExitCallback) onExitCallback({ exitCode: 1 });
      expect(session.ended).toBe(true);
      expect(session.exitCode).toBe(1);
    });
  });

  // ── Enhancement A: Completion markers ──────────────────
  describe("writeMarked", () => {
    beforeEach(() => {
      // Reset PTY process to bash and platform to POSIX
      mockPtyInstance.process = "bash";
      (platform as ReturnType<typeof vi.fn>).mockReturnValue("linux");
    });
    it("should return a non-empty marker string", async () => {
      const marker = await session.writeMarked("echo hello");
      expect(marker).toBeTruthy();
      expect(typeof marker).toBe("string");
      expect(marker).toMatch(/^__TERM_MARK_[0-9a-f]{6}__$/);
    });

    it("should include the command in the written output", async () => {
      await session.writeMarked("echo world");
      // writeMarked calls this.write() internally with marker-wrapped command
      const writeArg = mockPtyInstance.write.mock.calls.map((c: any[]) => c[0]).join("");
      expect(writeArg).toContain("echo world");
    });

    it("should write a marker-wrapped command through the write method", async () => {
      const marker = await session.writeMarked("ls -la");
      const writeArg = mockPtyInstance.write.mock.calls.map((c: any[]) => c[0]).join("");
      // The marker should appear twice in the command string
      expect(writeArg).toContain(marker);
      // The command itself should be between the markers
      expect(writeArg).toContain("ls -la");
    });

    it("should generate different markers across calls", async () => {
      const marker1 = await session.writeMarked("cmd a");
      const marker2 = await session.writeMarked("cmd b");
      expect(marker1).not.toBe(marker2);
    });

    it("should throw SessionEndedError when session is ended", async () => {
      // Simulate session exit
      if (onExitCallback) onExitCallback({ exitCode: 1 });
      expect(session.ended).toBe(true);

      await expect(session.writeMarked("echo nope")).rejects.toThrow("Session has ended");
    });

    it("should use POSIX ; syntax for bash shell", async () => {
      // The mock shell is "bash", so it should use ; separators
      const marker = await session.writeMarked("echo triangulate");
      const writeArg = mockPtyInstance.write.mock.calls.map((c: any[]) => c[0]).join("");
      // Verify POSIX format: echo MARKER; cmd; echo MARKER; echo "exit: $?"
      expect(writeArg).toMatch(/\becho\b/);
      expect(writeArg).toContain(";");
      // Verify marker appears at least twice (open and close)
      const markerCount = (
        writeArg.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []
      ).length;
      expect(markerCount).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Enhancement B: Pager-blocking env vars ─────────
  describe("pager env vars", () => {
    it("should set GIT_PAGER=cat in the PTY spawn env", () => {
      const envArg = (spawn as ReturnType<typeof vi.fn>).mock.calls[0][2]?.env as
        | Record<string, string>
        | undefined;
      expect(envArg).toBeDefined();
      expect(envArg?.GIT_PAGER).toBe("cat");
    });

    it("should set PAGER=cat in the PTY spawn env", () => {
      const envArg = (spawn as ReturnType<typeof vi.fn>).mock.calls[0][2]?.env as
        | Record<string, string>
        | undefined;
      expect(envArg?.PAGER).toBe("cat");
    });

    it("should set TERM=xterm-256color in the PTY spawn env", () => {
      const envArg = (spawn as ReturnType<typeof vi.fn>).mock.calls[0][2]?.env as
        | Record<string, string>
        | undefined;
      expect(envArg?.TERM).toBe("xterm-256color");
    });

    it("should allow user-provided env to override pager defaults", () => {
      new PTYSession({
        id: "override-test",
        shell: "bash",
        args: [],
        cwd: "/tmp",
        cols: 80,
        rows: 24,
        env: { GIT_PAGER: "less", PAGER: "less" },
      });

      const envArg = (spawn as ReturnType<typeof vi.fn>).mock.lastCall?.[2]?.env as
        | Record<string, string>
        | undefined;
      expect(envArg?.GIT_PAGER).toBe("less");
      expect(envArg?.PAGER).toBe("less");
    });

    it("should preserve user-provided env vars alongside pager defaults", () => {
      new PTYSession({
        id: "custom-env-test",
        shell: "bash",
        args: [],
        cwd: "/tmp",
        cols: 80,
        rows: 24,
        env: { MY_CUSTOM_VAR: "custom_value" },
      });

      const envArg = (spawn as ReturnType<typeof vi.fn>).mock.lastCall?.[2]?.env as
        | Record<string, string>
        | undefined;
      expect(envArg?.MY_CUSTOM_VAR).toBe("custom_value");
      // Defaults should still be present
      expect(envArg?.TERM).toBe("xterm-256color");
    });
  });

  // ── Enhancement C: Process group cleanup ────────────
  describe("process group cleanup", () => {
    it("should attempt process.kill with negative PID on POSIX", () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {});

      session.close();

      expect(killSpy).toHaveBeenCalledWith(-12345, "SIGHUP");

      killSpy.mockRestore();
    });

    it("should fallback to child.kill when process group kill fails", () => {
      // process.kill throws (simulating failure)
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("ESRCH");
      });

      session.close();

      // Fallback: should call pty.kill()
      expect(mockPtyInstance.kill).toHaveBeenCalled();
      killSpy.mockRestore();
    });

    it("should use taskkill on Windows after pty kill", () => {
      // Mock platform as win32
      (platform as ReturnType<typeof vi.fn>).mockReturnValue("win32");

      const winSession = new PTYSession({
        id: "win-test",
        shell: "cmd.exe",
        args: [],
        cwd: "/tmp",
        cols: 80,
        rows: 24,
      });

      winSession.close();

      // Windows: taskkill should clean up the process tree directly
      expect(execSync).toHaveBeenCalledWith(
        "taskkill /PID 12345 /T /F",
        expect.objectContaining({ stdio: "ignore" }),
      );

      (platform as ReturnType<typeof vi.fn>).mockReturnValue("linux");
    });
  });

  // ── Enhancement D: sendSignal ────────────────────────
  describe("sendSignal", () => {
    it("should send SIGINT as Ctrl+C", () => {
      session.sendSignal("SIGINT");
      expect(mockPtyInstance.write).toHaveBeenCalledWith("\x03");
    });

    it("should send SIGTSTP as Ctrl+Z", () => {
      session.sendSignal("SIGTSTP");
      expect(mockPtyInstance.write).toHaveBeenCalledWith("\x1a");
    });

    it("should send SIGQUIT as Ctrl+\\", () => {
      session.sendSignal("SIGQUIT");
      expect(mockPtyInstance.write).toHaveBeenCalledWith("\x1c");
    });

    it("should force close on SIGKILL", () => {
      session.sendSignal("SIGKILL");
      expect(mockPtyInstance.kill).toHaveBeenCalledWith("SIGKILL");
    });

    it("should use taskkill for SIGKILL on Windows", () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValue("win32");

      session.sendSignal("SIGKILL");

      expect(execSync).toHaveBeenCalledWith(
        "taskkill /PID 12345 /T /F",
        expect.objectContaining({ stdio: "ignore" }),
      );

      (platform as ReturnType<typeof vi.fn>).mockReturnValue("linux");
    });

    it("should throw on unknown signal", () => {
      expect(() => session.sendSignal("SIGFOO")).toThrow("Unknown signal");
    });

    it("should update lastActivity on signal", () => {
      const before = session.lastActivity.getTime();
      session.sendSignal("SIGINT");
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  // ── Enhancement E: read with since parameter ─────────
  describe("read with since parameter", () => {
    it("should return data from a byte position", () => {
      if (onDataCallback) onDataCallback("hello world");
      const result = session.read(3);
      expect(result.data).toBe("lo world");
      expect(result.position).toBe(11);
    });

    it("should not advance readOffset (peek, not consume)", () => {
      if (onDataCallback) onDataCallback("some data here");
      session.read(5);
      // readAll() should still return full data
      expect(session.read().data).toBe("some data here");
    });
  });

  // ── Enhancement F: resize after end ──────────────────
  describe("resize", () => {
    it("should be no-op after session ended", () => {
      if (onExitCallback) onExitCallback({ exitCode: 0 });
      session.resize(200, 100);
      expect(mockPtyInstance.resize).not.toHaveBeenCalled();
    });
  });
});
