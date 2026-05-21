import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the pure handler functions exported from server.ts.
// These are not yet implemented — this is RED phase.

import {
  handleListTools,
  handleCallTool,
  handleListResources,
  handleReadResource,
  handleBufferResource,
  handleStatusResource,
  handleEventsResource,
  handleExportResource,
} from "../../src/server.js";

import type { SessionManager } from "../../src/core/session-manager.js";

import {
  SessionNotFoundError,
  SessionLimitError,
  SessionPolicyError,
  ReadTimeoutError,
} from "../../src/types.js";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------
interface MockPTYSession {
  id: string;
  cwd: string;
  write: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  readUntil: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  getInfo: ReturnType<typeof vi.fn>;
  tail: ReturnType<typeof vi.fn>;
  screenshot: ReturnType<typeof vi.fn>;
  sendSignal: ReturnType<typeof vi.fn>;
  getDiagnostics: ReturnType<typeof vi.fn>;
  getRecentEvents: ReturnType<typeof vi.fn>;
  exportSession: ReturnType<typeof vi.fn>;
}

interface MockSessionManager {
  createSession: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
  writeToSession: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  closeSession: ReturnType<typeof vi.fn>;
  activeCount: number;
}

function createMockSession(overrides?: Partial<MockPTYSession>): MockPTYSession {
  return {
    id: "session-1",
    cwd: "/test/workspace",
    write: vi.fn().mockReturnValue(8),
    read: vi
      .fn()
      .mockReturnValue({ data: "hello world", ended: false, exit_code: null, position: 0 }),
    readUntil: vi.fn().mockResolvedValue({
      data: "hello world",
      fullOutput: "full hello world",
      matched: "hello",
      ended: false,
      exit_code: null,
      timed_out: false,
    }),
    tail: vi.fn().mockReturnValue({ data: "last lines", lines: 20, total_size: 100 }),
    screenshot: vi.fn().mockReturnValue({
      rows: ["line1", "line2"],
      cursorRow: 1,
      cursorCol: 5,
      cols: 80,
      rowsCount: 24,
      text: "line1\nline2",
      outputBytes: 42,
      lastOutputAt: "2026-04-30T20:05:00.000Z",
      idleMs: 120,
      isInteractive: true,
      detectedPrompt: "package name: (demo)",
      recommendedNextAction: "input_required",
      promptCategory: "text",
      shouldAskUser: false,
      askUserReason: null,
      canAcceptDefault: true,
      terminal_mode: "shell",
      status_line: null,
      content_rows: ["line1", "line2"],
    }),
    sendSignal: vi.fn(),
    getRecentEvents: vi.fn().mockReturnValue([
      { at: "2026-04-30T20:00:00.000Z", type: "session_created" },
      { at: "2026-04-30T20:00:01.000Z", type: "write", preview: "npm init", bytes: 8 },
    ]),
    getDiagnostics: vi.fn().mockReturnValue({
      session: {
        id: "session-1",
        shell: "/usr/bin/zsh",
        cwd: "/test/workspace",
        cols: 80,
        rows: 24,
        created_at: "2026-04-30T20:00:00.000Z",
        last_activity: "2026-04-30T20:05:00.000Z",
        last_output_at: "2026-04-30T20:05:00.000Z",
        idle_ms: 120,
        output_bytes: 42,
        alive: true,
      },
      recent_events: [
        { at: "2026-04-30T20:00:00.000Z", type: "session_created" },
        { at: "2026-04-30T20:00:01.000Z", type: "write", preview: "npm init", bytes: 8 },
      ],
      last_screenshot: {
        rows: ["line1", "line2"],
        cursorRow: 1,
        cursorCol: 5,
        cols: 80,
        rowsCount: 24,
        text: "line1\nline2",
        outputBytes: 42,
        lastOutputAt: "2026-04-30T20:05:00.000Z",
        idleMs: 120,
        isInteractive: true,
        detectedPrompt: "package name: (demo)",
        recommendedNextAction: "input_required",
        promptCategory: "text",
        shouldAskUser: false,
        askUserReason: null,
        canAcceptDefault: true,
        terminal_mode: "shell",
        status_line: null,
        content_rows: ["line1", "line2"],
      },
    }),
    exportSession: vi.fn().mockReturnValue({
      session: {
        id: "session-1",
        shell: "/usr/bin/zsh",
        cwd: "/test/workspace",
        cols: 80,
        rows: 24,
        created_at: "2026-04-30T20:00:00.000Z",
        last_activity: "2026-04-30T20:05:00.000Z",
        last_output_at: "2026-04-30T20:05:00.000Z",
        idle_ms: 120,
        output_bytes: 42,
        alive: true,
      },
      recent_events: [
        { at: "2026-04-30T20:00:00.000Z", type: "session_created" },
        { at: "2026-04-30T20:00:01.000Z", type: "write", preview: "npm init", bytes: 8 },
      ],
      last_screenshot: {
        rows: ["line1", "line2"],
        cursorRow: 1,
        cursorCol: 5,
        cols: 80,
        rowsCount: 24,
        text: "line1\nline2",
        outputBytes: 42,
        lastOutputAt: "2026-04-30T20:05:00.000Z",
        idleMs: 120,
        isInteractive: true,
        detectedPrompt: "package name: (demo)",
        promptCategory: "text",
        shouldAskUser: false,
        askUserReason: null,
        canAcceptDefault: true,
        recommendedNextAction: "input_required",
        terminal_mode: "shell",
        status_line: null,
        content_rows: ["line1", "line2"],
      },
      transcript: [
        { at: "2026-04-30T20:00:01.000Z", kind: "input", summary: "npm init", bytes: 8 },
        {
          at: "2026-04-30T20:00:02.000Z",
          kind: "output",
          summary: "package name: (demo)",
          bytes: 20,
        },
      ],
    }),
    resize: vi.fn(),
    close: vi.fn().mockReturnValue(0),
    getInfo: vi.fn().mockReturnValue({
      id: "session-1",
      shell: "/usr/bin/zsh",
      cwd: "/test/workspace",
      cols: 80,
      rows: 24,
      created_at: "2026-04-30T20:00:00.000Z",
      last_activity: "2026-04-30T20:05:00.000Z",
      alive: true,
    }),
    ...overrides,
  };
}

function createMockSessionManager(overrides?: Partial<MockSessionManager>): MockSessionManager {
  return {
    createSession: vi.fn().mockResolvedValue({
      id: "session-1",
      shell: "/usr/bin/zsh",
      cwd: "/test/workspace",
      cols: 80,
      rows: 24,
      created_at: "2026-04-30T20:00:00.000Z",
      last_activity: "2026-04-30T20:05:00.000Z",
      alive: true,
    }),
    getSession: vi.fn().mockReturnValue(createMockSession()),
    writeToSession: vi.fn().mockReturnValue(8),
    listSessions: vi.fn().mockReturnValue([
      {
        id: "session-1",
        shell: "/usr/bin/zsh",
        cwd: "/test/workspace",
        cols: 80,
        rows: 24,
        created_at: "2026-04-30T20:00:00.000Z",
        last_activity: "2026-04-30T20:05:00.000Z",
        alive: true,
      },
      {
        id: "session-2",
        shell: "/usr/bin/bash",
        cwd: "/other",
        cols: 120,
        rows: 40,
        created_at: "2026-04-30T20:01:00.000Z",
        last_activity: "2026-04-30T20:06:00.000Z",
        alive: false,
      },
    ]),
    closeSession: vi.fn().mockReturnValue(0),
    activeCount: 2,
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Server Handler Functions", () => {
  let mockSm: MockSessionManager;
  let mockSession: MockPTYSession;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSm = createMockSessionManager();
    mockSession = createMockSession();
    mockSm.getSession.mockReturnValue(mockSession);
  });

  // ---- handleListTools ----
  describe("handleListTools", () => {
    it("should return 13 tools", async () => {
      const result = await handleListTools();
      expect(result.tools).toHaveLength(13);
    });

    it("should include terminal_create_session", async () => {
      const result = await handleListTools();
      const names = result.tools.map((t: any) => t.name);
      expect(names).toContain("terminal_create_session");
    });

    it("should include terminal_write", async () => {
      const result = await handleListTools();
      const names = result.tools.map((t: any) => t.name);
      expect(names).toContain("terminal_write");
    });

    it("should include terminal_read_until", async () => {
      const result = await handleListTools();
      const names = result.tools.map((t: any) => t.name);
      expect(names).toContain("terminal_read_until");
    });

    it("should include terminal_session_diagnostics", async () => {
      const result = await handleListTools();
      const names = result.tools.map((t: any) => t.name);
      expect(names).toContain("terminal_session_diagnostics");
    });

    it("should include terminal_session_export", async () => {
      const result = await handleListTools();
      const names = result.tools.map((t: any) => t.name);
      expect(names).toContain("terminal_session_export");
    });

    it("each tool should have name and description", async () => {
      const result = await handleListTools();
      for (const tool of result.tools) {
        expect(tool.name).toBeTruthy();
        expect(typeof tool.name).toBe("string");
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe("string");
      }
    });

    it("each tool should have inputSchema with type object", async () => {
      const result = await handleListTools();
      for (const tool of result.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });
  });

  // ---- handleCallTool ----
  describe("handleCallTool", () => {
    describe("terminal_create_session", () => {
      it("should create session and return SessionInfo", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_create_session",
          arguments: {},
        });
        expect(mockSm.createSession).toHaveBeenCalled();
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.id).toBe("session-1");
        expect(parsed.shell).toBe("/usr/bin/zsh");
        expect(result.isError).toBeUndefined();
      });

      it("should pass shell, cwd, cols, rows to createSession", async () => {
        await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_create_session",
          arguments: { shell: "bash", cwd: "/custom", cols: 120, rows: 40 },
        });
        expect(mockSm.createSession).toHaveBeenCalledWith(
          expect.objectContaining({ shell: "bash", cwd: "/custom", cols: 120, rows: 40 }),
        );
      });

      it("should pass env variables if provided", async () => {
        await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_create_session",
          arguments: { env: { TERM: "xterm-256color", CI: "true" } },
        });
        expect(mockSm.createSession).toHaveBeenCalledWith(
          expect.objectContaining({ env: { TERM: "xterm-256color", CI: "true" } }),
        );
      });

      it("should handle SessionLimitError", async () => {
        mockSm.createSession.mockRejectedValue(new SessionLimitError(10));
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_create_session",
          arguments: {},
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Maximum session limit");
      });
    });

    describe("terminal_write", () => {
      it("should write data and return WriteResult", async () => {
        mockSm.writeToSession.mockReturnValue(5);
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_write",
          arguments: { id: "session-1", data: "echo hello" },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.ok).toBe(true);
        expect(parsed.bytes_written).toBe(5);
        expect(result.isError).toBeUndefined();
      });

      it("should handle SessionNotFoundError", async () => {
        mockSm.writeToSession.mockImplementation(() => {
          throw new SessionNotFoundError("missing");
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_write",
          arguments: { id: "missing", data: "hi" },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Session not found");
      });

      it("should handle SessionPolicyError", async () => {
        mockSm.writeToSession.mockImplementation(() => {
          throw new SessionPolicyError("Command blocked by configured deny pattern");
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_write",
          arguments: { id: "session-1", data: "rm -rf dist" },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Command blocked");
      });
    });

    describe("terminal_read", () => {
      it("should read from session and return ReadResult", async () => {
        mockSession.read.mockReturnValue({
          data: "output here",
          ended: false,
          exit_code: null,
          position: 0,
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read",
          arguments: { id: "session-1" },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toBe("output here");
        expect(parsed.ended).toBe(false);
        expect(parsed.exit_code).toBeNull();
      });

      it("should pass flush parameter to session.read", async () => {
        await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read",
          arguments: { id: "session-1", flush: true },
        });
        expect(mockSession.read).toHaveBeenCalledWith(true);
      });

      it("should default flush to false", async () => {
        await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read",
          arguments: { id: "session-1" },
        });
        expect(mockSession.read).toHaveBeenCalledWith(undefined);
      });

      // ---- Phase 3: since parameter ----

      it("should accept since parameter and pass to session.read", async () => {
        mockSession.read.mockReturnValue({
          data: "new data",
          ended: false,
          exit_code: null,
          position: 42,
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read",
          arguments: { id: "session-1", since: 10 },
        });
        expect(mockSession.read).toHaveBeenCalledWith(10);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toBe("new data");
        expect(parsed.position).toBe(42);
      });

      it("should return position in response when since is provided", async () => {
        mockSession.read.mockReturnValue({
          data: "specific output",
          ended: false,
          exit_code: null,
          position: 100,
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read",
          arguments: { id: "session-1", since: 0 },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.position).toBe(100);
      });

      it("should return full data without since (backward compat)", async () => {
        mockSession.read.mockReturnValue({
          data: "everything",
          ended: true,
          exit_code: 0,
          position: 50,
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read",
          arguments: { id: "session-1" },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toBe("everything");
        expect(parsed.ended).toBe(true);
        expect(parsed.exit_code).toBe(0);
        // position is present but not asserted for specific value
        expect(parsed.position).toBeDefined();
      });

      it("should handle since=0 correctly (read from beginning)", async () => {
        mockSession.read.mockReturnValue({
          data: "complete buffer",
          ended: false,
          exit_code: null,
          position: 80,
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read",
          arguments: { id: "session-1", since: 0 },
        });
        expect(mockSession.read).toHaveBeenCalledWith(0);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toBe("complete buffer");
        expect(parsed.position).toBe(80);
      });
    });

    describe("terminal_read_until", () => {
      it("should return compact output by default", async () => {
        mockSession.readUntil.mockResolvedValue({
          data: "prompt> ",
          fullOutput: "all output prompt> ",
          matched: "prompt>",
          ended: false,
          exit_code: null,
          timed_out: false,
          debug: {
            session_id: "session-1",
            pattern: "prompt>",
            timeout_ms: 30000,
            idle_ms: 120,
            last_output_at: "2026-04-30T20:05:00.000Z",
            output_bytes: 42,
            detected_prompt: "package name: (demo)",
            prompt_category: "text",
            should_ask_user: false,
            ask_user_reason: null,
            can_accept_default: true,
            recommended_next_action: "input_required",
          },
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read_until",
          arguments: { id: "session-1", pattern: "prompt>" },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toBe("prompt> ");
        expect(parsed.matched).toBe("prompt>");
        expect(parsed.timed_out).toBe(false);
        expect(parsed.full_output).toBeUndefined();
        expect(parsed.debug).toBeUndefined();
      });

      it("should include full_output and debug when explicitly requested", async () => {
        mockSession.readUntil.mockResolvedValue({
          data: "prompt> ",
          fullOutput: "all output prompt> ",
          matched: "prompt>",
          ended: false,
          exit_code: null,
          timed_out: false,
          debug: {
            session_id: "session-1",
            pattern: "prompt>",
            timeout_ms: 30000,
            idle_ms: 120,
            last_output_at: "2026-04-30T20:05:00.000Z",
            output_bytes: 42,
            detected_prompt: "package name: (demo)",
            prompt_category: "text",
            should_ask_user: false,
            ask_user_reason: null,
            can_accept_default: true,
            recommended_next_action: "input_required",
          },
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read_until",
          arguments: {
            id: "session-1",
            pattern: "prompt>",
            include_full_output: true,
            include_debug: true,
          },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.full_output).toBe("all output prompt> ");
        expect(parsed.debug?.session_id).toBe("session-1");
      });

      it("should pass timeout_ms and strip_ansi", async () => {
        await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read_until",
          arguments: { id: "session-1", pattern: "done", timeout_ms: 5000, strip_ansi: true },
        });
        expect(mockSession.readUntil).toHaveBeenCalledWith("done", 5000, true);
      });

      it("should handle timeout", async () => {
        mockSession.readUntil.mockRejectedValue(new ReadTimeoutError("timed out", "partial-data"));
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read_until",
          arguments: { id: "session-1", pattern: "never" },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.timed_out).toBe(true);
        expect(parsed.data).toBe("partial-data");
        expect(parsed.full_output).toBeUndefined();
      });

      it("should handle SessionNotFoundError", async () => {
        mockSm.getSession.mockImplementation(() => {
          throw new SessionNotFoundError("gone");
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_read_until",
          arguments: { id: "gone", pattern: "x" },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Session not found");
      });
    });

    describe("terminal_resize", () => {
      it("should resize session and return new dimensions", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_resize",
          arguments: { id: "session-1", cols: 120, rows: 40 },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.cols).toBe(120);
        expect(parsed.rows).toBe(40);
        expect(mockSession.resize).toHaveBeenCalledWith(120, 40);
      });

      it("should handle SessionNotFoundError", async () => {
        mockSm.getSession.mockImplementation(() => {
          throw new SessionNotFoundError("bad");
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_resize",
          arguments: { id: "bad", cols: 80, rows: 24 },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Session not found");
      });
    });

    describe("terminal_session_diagnostics", () => {
      it("should return diagnostics with recent events and screenshot", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_session_diagnostics",
          arguments: { id: "session-1", event_limit: 10 },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.session.id).toBe("session-1");
        expect(parsed.recent_events).toHaveLength(2);
        expect(parsed.last_screenshot.detectedPrompt).toBe("package name: (demo)");
        expect(mockSession.getDiagnostics).toHaveBeenCalledWith(10);
      });
    });

    describe("terminal_session_export", () => {
      it("should return export payload with transcript", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_session_export",
          arguments: { id: "session-1", event_limit: 10 },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.session.id).toBe("session-1");
        expect(parsed.transcript).toHaveLength(2);
        expect(parsed.transcript[0].kind).toBe("input");
        expect(mockSession.exportSession).toHaveBeenCalledWith(10);
      });
    });

    describe("terminal_list_sessions", () => {
      it("should list all sessions", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_list_sessions",
          arguments: {},
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.sessions).toHaveLength(2);
        expect(parsed.sessions[0].id).toBe("session-1");
        expect(parsed.sessions[1].id).toBe("session-2");
      });

      it("should handle empty session list", async () => {
        mockSm.listSessions.mockReturnValue([]);
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_list_sessions",
          arguments: {},
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.sessions).toEqual([]);
      });

      it("should accept verbose flag", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_list_sessions",
          arguments: { verbose: true },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.sessions).toHaveLength(2);
      });
    });

    describe("terminal_close_session", () => {
      it("should close session and return exit code", async () => {
        mockSm.closeSession.mockReturnValue(0);
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_close_session",
          arguments: { id: "session-1" },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.ok).toBe(true);
        expect(parsed.exit_code).toBe(0);
        expect(mockSm.closeSession).toHaveBeenCalledWith("session-1", false);
      });

      it("should pass force flag", async () => {
        await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_close_session",
          arguments: { id: "session-1", force: true },
        });
        expect(mockSm.closeSession).toHaveBeenCalledWith("session-1", true);
      });

      it("should handle SessionNotFoundError", async () => {
        mockSm.closeSession.mockImplementation(() => {
          throw new SessionNotFoundError("no-such");
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_close_session",
          arguments: { id: "no-such" },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Session not found");
      });
    });

    describe("terminal_ping", () => {
      it("should return ok status with session count and uptime", async () => {
        mockSm.activeCount = 3;
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_ping",
          arguments: {},
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.ok).toBe(true);
        expect(parsed.sessions).toBe(3);
        expect(typeof parsed.uptime_ms).toBe("number");
        expect(parsed.version).toBeDefined();
      });

      it("should report 0 sessions when none active", async () => {
        mockSm.activeCount = 0;
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_ping",
          arguments: {},
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.ok).toBe(true);
        expect(parsed.sessions).toBe(0);
      });
    });

    describe("terminal_screenshot", () => {
      it("should return a compact screenshot payload by default", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_screenshot",
          arguments: { id: "session-1" },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.text).toBe("line1\nline2");
        expect(parsed.terminal_mode).toBe("shell");
        expect(parsed.detectedPrompt).toBe("package name: (demo)");
        expect(parsed.recommendedNextAction).toBe("input_required");
        expect(parsed.rows).toBeUndefined();
        expect(parsed.content_rows).toBeUndefined();
        expect(parsed.outputBytes).toBeUndefined();
        expect(parsed.promptCategory).toBeUndefined();
        expect(mockSession.screenshot).toHaveBeenCalled();
      });

      it("should include diagnostic fields when verbosity is diagnostic", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_screenshot",
          arguments: { id: "session-1", verbosity: "diagnostic" },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.rows).toContain("line1");
        expect(parsed.content_rows).toBeDefined();
        expect(parsed.outputBytes).toBe(42);
        expect(parsed.promptCategory).toBe("text");
        expect(parsed.shouldAskUser).toBe(false);
        expect(parsed.canAcceptDefault).toBe(true);
      });

      it("should handle SessionNotFoundError", async () => {
        mockSm.getSession.mockImplementation(() => {
          throw new SessionNotFoundError("missing");
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_screenshot",
          arguments: { id: "missing" },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Session not found");
      });
    });

    describe("terminal_tail", () => {
      it("should return last N lines of session output", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_tail",
          arguments: { id: "session-1", lines: 10 },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.data).toBe("last lines");
        expect(mockSession.tail).toHaveBeenCalledWith(10);
      });

      it("should default to 20 lines when lines not specified", async () => {
        await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_tail",
          arguments: { id: "session-1" },
        });
        expect(mockSession.tail).toHaveBeenCalledWith(20);
      });

      it("should handle SessionNotFoundError", async () => {
        mockSm.getSession.mockImplementation(() => {
          throw new SessionNotFoundError("gone");
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_tail",
          arguments: { id: "gone" },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Session not found");
      });
    });

    describe("terminal_send_signal", () => {
      it("should send SIGINT to the session", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_send_signal",
          arguments: { id: "session-1", signal: "SIGINT" },
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.ok).toBe(true);
        expect(parsed.signal).toBe("SIGINT");
        expect(mockSession.sendSignal).toHaveBeenCalledWith("SIGINT");
      });

      it("should send SIGTSTP to the session", async () => {
        await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_send_signal",
          arguments: { id: "session-1", signal: "SIGTSTP" },
        });
        expect(mockSession.sendSignal).toHaveBeenCalledWith("SIGTSTP");
      });

      it("should handle error from sendSignal", async () => {
        mockSession.sendSignal.mockImplementation(() => {
          throw new Error("Unknown signal: SIGFOO");
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_send_signal",
          arguments: { id: "session-1", signal: "SIGFOO" },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Unknown signal");
      });

      it("should handle SessionNotFoundError", async () => {
        mockSm.getSession.mockImplementation(() => {
          throw new SessionNotFoundError("lost");
        });
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "terminal_send_signal",
          arguments: { id: "lost", signal: "SIGINT" },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Session not found");
      });
    });

    describe("unknown tool", () => {
      it("should return error for unknown tool name", async () => {
        const result = await handleCallTool(mockSm as unknown as SessionManager, {
          name: "unknown_tool",
          arguments: {},
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Unknown tool");
      });
    });
  });

  // ---- handleListResources ----
  describe("handleListResources", () => {
    it("should return 5 resources", async () => {
      const result = await handleListResources();
      expect(result.resources).toHaveLength(5);
    });

    it("should include terminal://sessions resource", async () => {
      const result = await handleListResources();
      const uris = result.resources.map((r: any) => r.uri);
      expect(uris).toContain("terminal://sessions");
    });

    it("should include terminal://sessions/{id}/buffer resource", async () => {
      const result = await handleListResources();
      const uris = result.resources.map((r: any) => r.uri);
      expect(uris).toContain("terminal://sessions/{id}/buffer");
    });

    it("should include terminal://sessions/{id}/status resource", async () => {
      const result = await handleListResources();
      const uris = result.resources.map((r: any) => r.uri);
      expect(uris).toContain("terminal://sessions/{id}/status");
    });

    it("should include terminal://sessions/{id}/events resource", async () => {
      const result = await handleListResources();
      const uris = result.resources.map((r: any) => r.uri);
      expect(uris).toContain("terminal://sessions/{id}/events");
    });

    it("should include terminal://sessions/{id}/export resource", async () => {
      const result = await handleListResources();
      const uris = result.resources.map((r: any) => r.uri);
      expect(uris).toContain("terminal://sessions/{id}/export");
    });
  });

  // ---- handleReadResource ----
  describe("handleReadResource", () => {
    it("should return sessions list for terminal://sessions", async () => {
      const result = await handleReadResource(mockSm as unknown as SessionManager, {
        uri: "terminal://sessions",
      });
      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe("session-1");
    });

    it("should return buffer content for terminal://sessions/{id}/buffer", async () => {
      mockSession.read.mockReturnValue({ data: "buffer content", ended: false, exit_code: null });
      const result = await handleReadResource(mockSm as unknown as SessionManager, {
        uri: "terminal://sessions/session-1/buffer",
      });
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.data).toBe("buffer content");
    });

    it("should return status for terminal://sessions/{id}/status", async () => {
      const result = await handleReadResource(mockSm as unknown as SessionManager, {
        uri: "terminal://sessions/session-1/status",
      });
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.id).toBe("session-1");
      expect(parsed.alive).toBe(true);
    });

    it("should return events for terminal://sessions/{id}/events", async () => {
      const result = await handleReadResource(mockSm as unknown as SessionManager, {
        uri: "terminal://sessions/session-1/events",
      });
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.events).toHaveLength(2);
      expect(parsed.events[0].type).toBe("session_created");
    });

    it("should return export for terminal://sessions/{id}/export", async () => {
      const result = await handleReadResource(mockSm as unknown as SessionManager, {
        uri: "terminal://sessions/session-1/export",
      });
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.transcript).toHaveLength(2);
      expect(parsed.transcript[0].kind).toBe("input");
    });

    it("should handle unknown URI", async () => {
      await expect(
        handleReadResource(mockSm as unknown as SessionManager, { uri: "terminal://unknown" }),
      ).rejects.toThrow();
    });

    it("should handle SessionNotFoundError for buffer resource", async () => {
      mockSm.getSession.mockImplementation(() => {
        throw new SessionNotFoundError("gone");
      });
      await expect(
        handleReadResource(mockSm as unknown as SessionManager, {
          uri: "terminal://sessions/gone/buffer",
        }),
      ).rejects.toThrow();
    });
  });

  // ---- handleBufferResource ----
  describe("handleBufferResource", () => {
    it("should return buffer content for a session", async () => {
      mockSession.read.mockReturnValue({
        data: "buffer content",
        ended: false,
        exit_code: null,
      });
      const result = await handleBufferResource(
        mockSm as unknown as SessionManager,
        new URL("http://localhost/terminal://sessions/test-123/buffer"),
        { id: "test-123" },
      );
      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.data).toBe("buffer content");
    });

    it("should throw on session not found", async () => {
      mockSm.getSession.mockImplementation(() => {
        throw new SessionNotFoundError("gone");
      });
      await expect(
        handleBufferResource(
          mockSm as unknown as SessionManager,
          new URL("http://localhost/terminal://sessions/gone/buffer"),
          { id: "gone" },
        ),
      ).rejects.toThrow();
    });
  });

  // ---- handleStatusResource ----
  describe("handleStatusResource", () => {
    it("should return session status info", async () => {
      const result = await handleStatusResource(
        mockSm as unknown as SessionManager,
        new URL("http://localhost/terminal://sessions/test-123/status"),
        { id: "test-123" },
      );
      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.id).toBe("session-1");
      expect(parsed.alive).toBe(true);
    });

    it("should throw on session not found", async () => {
      mockSm.getSession.mockImplementation(() => {
        throw new SessionNotFoundError("missing");
      });
      await expect(
        handleStatusResource(
          mockSm as unknown as SessionManager,
          new URL("http://localhost/terminal://sessions/missing/status"),
          { id: "missing" },
        ),
      ).rejects.toThrow();
    });
  });

  // ---- handleEventsResource ----
  describe("handleEventsResource", () => {
    it("should return recent session events", async () => {
      const result = await handleEventsResource(
        mockSm as unknown as SessionManager,
        new URL("http://localhost/terminal://sessions/test-123/events"),
        { id: "test-123" },
      );
      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.events).toHaveLength(2);
    });

    it("should throw on session not found", async () => {
      mockSm.getSession.mockImplementation(() => {
        throw new SessionNotFoundError("missing");
      });
      await expect(
        handleEventsResource(
          mockSm as unknown as SessionManager,
          new URL("http://localhost/terminal://sessions/missing/events"),
          { id: "missing" },
        ),
      ).rejects.toThrow();
    });
  });

  // ---- handleExportResource ----
  describe("handleExportResource", () => {
    it("should return session export payload", async () => {
      const result = await handleExportResource(
        mockSm as unknown as SessionManager,
        new URL("http://localhost/terminal://sessions/test-123/export"),
        { id: "test-123" },
      );
      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.transcript).toHaveLength(2);
      expect(parsed.transcript[1].kind).toBe("output");
    });

    it("should throw on session not found", async () => {
      mockSm.getSession.mockImplementation(() => {
        throw new SessionNotFoundError("missing");
      });
      await expect(
        handleExportResource(
          mockSm as unknown as SessionManager,
          new URL("http://localhost/terminal://sessions/missing/export"),
          { id: "missing" },
        ),
      ).rejects.toThrow();
    });
  });
});
