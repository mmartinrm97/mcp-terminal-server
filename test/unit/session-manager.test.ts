import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { dirname, join, resolve } from "node:path";

// Mock node-pty
vi.mock("node-pty", () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    cols: 80,
    rows: 24,
    process: "bash",
    handleFlowControl: false,
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  })),
}));
import { SessionManager } from "../../src/core/session-manager.js";

import { SessionNotFoundError, SessionLimitError, SessionPolicyError } from "../../src/types.js";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    // Clean up manager to avoid timer leaks
    if (manager) {
      manager.dispose();
    }
  });

  describe("construction", () => {
    it("should create with default config", () => {
      manager = new SessionManager();
      expect(manager.activeCount).toBe(0);
    });

    it("should create with custom config", () => {
      manager = new SessionManager({ max_sessions: 5, session_ttl_ms: 60000 });
      expect(manager.activeCount).toBe(0);
    });
  });

  describe("createSession", () => {
    it("should create a new session and return info", async () => {
      manager = new SessionManager({ max_sessions: 10, session_ttl_ms: 999999 });
      const info = await manager.createSession({
        shell: "bash",
        cwd: "/test",
        cols: 80,
        rows: 24,
      });
      expect(info.id).toBeTruthy();
      expect(info.shell).toBe("bash");
      expect(info.cwd).toBe("/test");
      expect(manager.activeCount).toBe(1);
    });

    it("should generate a UUID id when none provided", async () => {
      manager = new SessionManager({ max_sessions: 10, session_ttl_ms: 999999 });
      const info = await manager.createSession({ shell: "cmd" });
      // UUID v4 format
      expect(info.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("should use auto shell detection when shell=auto", async () => {
      manager = new SessionManager({ max_sessions: 10, session_ttl_ms: 999999 });
      const info = await manager.createSession({ shell: "auto" });
      expect(typeof info.shell).toBe("string");
      expect(info.shell.length).toBeGreaterThan(0);
    });

    it("should default cwd to process.cwd()", async () => {
      manager = new SessionManager({ max_sessions: 10, session_ttl_ms: 999999 });
      const info = await manager.createSession({});
      expect(info.cwd).toBe(process.cwd());
    });

    it("should enforce max session limit", async () => {
      manager = new SessionManager({ max_sessions: 1, session_ttl_ms: 999999 });
      await manager.createSession({ shell: "cmd" });
      await expect(manager.createSession({ shell: "cmd" })).rejects.toThrow(SessionLimitError);
    });

    it("should reject session cwd outside allowed roots", async () => {
      const allowedRoot = resolve(process.cwd(), "sandbox");
      const blockedCwd = dirname(process.cwd());
      manager = new SessionManager({
        max_sessions: 10,
        session_ttl_ms: 999999,
        allowed_cwd_roots: [allowedRoot],
      });
      await expect(manager.createSession({ cwd: blockedCwd })).rejects.toThrow(SessionPolicyError);
    });

    it("should allow session cwd inside allowed roots", async () => {
      const allowedRoot = resolve(process.cwd(), "sandbox");
      const nestedCwd = join(allowedRoot, "project-a");
      manager = new SessionManager({
        max_sessions: 10,
        session_ttl_ms: 999999,
        allowed_cwd_roots: [allowedRoot],
      });
      const info = await manager.createSession({ cwd: nestedCwd });
      expect(info.cwd).toBe(nestedCwd);
    });
  });

  describe("getSession", () => {
    it("should return the session by id", async () => {
      manager = new SessionManager({ max_sessions: 10, session_ttl_ms: 999999 });
      const info = await manager.createSession({ shell: "cmd" });
      const session = manager.getSession(info.id);
      expect(session.id).toBe(info.id);
    });

    it("should throw SessionNotFoundError for unknown id", () => {
      manager = new SessionManager();
      expect(() => manager.getSession("nonexistent")).toThrow(SessionNotFoundError);
    });
  });

  describe("listSessions", () => {
    it("should return an array of session infos", async () => {
      manager = new SessionManager({ max_sessions: 10, session_ttl_ms: 999999 });
      const info1 = await manager.createSession({ shell: "cmd" });
      const info2 = await manager.createSession({ shell: "cmd" });
      const list = manager.listSessions();
      expect(list).toHaveLength(2);
      expect(list.map((s) => s.id)).toEqual(expect.arrayContaining([info1.id, info2.id]));
    });

    it("should return empty array when no sessions", () => {
      manager = new SessionManager();
      expect(manager.listSessions()).toEqual([]);
    });
  });

  describe("closeSession", () => {
    it("should close and remove a session", async () => {
      manager = new SessionManager({ max_sessions: 10, session_ttl_ms: 999999 });
      const info = await manager.createSession({ shell: "cmd" });
      expect(manager.activeCount).toBe(1);
      manager.closeSession(info.id);
      expect(manager.activeCount).toBe(0);
    });

    it("should throw SessionNotFoundError for unknown id", () => {
      manager = new SessionManager();
      expect(() => manager.closeSession("nonexistent")).toThrow(SessionNotFoundError);
    });
  });

  describe("writeToSession", () => {
    it("should write when no command policy is configured", async () => {
      manager = new SessionManager({ max_sessions: 10, session_ttl_ms: 999999 });
      const info = await manager.createSession({ shell: "cmd" });
      const bytes = manager.writeToSession(info.id, "echo hello");
      expect(bytes).toBeGreaterThan(0);
    });

    it("should reject commands that match deny patterns", async () => {
      manager = new SessionManager({
        max_sessions: 10,
        session_ttl_ms: 999999,
        command_deny_patterns: ["rm\\s+-rf", "git\\s+reset\\s+--hard"],
      });
      const info = await manager.createSession({ shell: "cmd" });
      expect(() => manager.writeToSession(info.id, "rm -rf dist")).toThrow(SessionPolicyError);
    });

    it("should reject commands not matched by allow patterns when allowlist is active", async () => {
      manager = new SessionManager({
        max_sessions: 10,
        session_ttl_ms: 999999,
        command_allow_patterns: ["^echo\\b", "^pwd\\b"],
      });
      const info = await manager.createSession({ shell: "cmd" });
      expect(() => manager.writeToSession(info.id, "npm init")).toThrow(SessionPolicyError);
    });

    it("should allow commands matched by allow patterns", async () => {
      manager = new SessionManager({
        max_sessions: 10,
        session_ttl_ms: 999999,
        command_allow_patterns: ["^echo\\b", "^pwd\\b"],
      });
      const info = await manager.createSession({ shell: "cmd" });
      const bytes = manager.writeToSession(info.id, "echo hello");
      expect(bytes).toBeGreaterThan(0);
    });
  });

  describe("dispose", () => {
    it("should close all sessions and stop the cleanup timer", async () => {
      manager = new SessionManager({ max_sessions: 10, session_ttl_ms: 999999 });
      await manager.createSession({ shell: "cmd" });
      await manager.createSession({ shell: "cmd" });
      expect(manager.activeCount).toBe(2);
      manager.dispose();
      expect(manager.activeCount).toBe(0);
    });
  });

  describe("cleanup policies", () => {
    it("should not treat recent output as idle", async () => {
      vi.useFakeTimers();
      manager = new SessionManager({ max_sessions: 10, session_ttl_ms: 1000 });
      const info = await manager.createSession({ shell: "cmd" });
      const session = manager.getSession(info.id);

      session.lastActivity = new Date(Date.now() - 5_000);
      session.lastOutputAt = new Date(Date.now() - 100);

      (manager as any).cleanupExpiredSessions();
      expect(manager.activeCount).toBe(1);
    });

    it("should force close when max session duration is exceeded", async () => {
      vi.useFakeTimers();
      manager = new SessionManager({
        max_sessions: 10,
        session_ttl_ms: 999999,
        session_max_duration_ms: 1000,
      });
      const info = await manager.createSession({ shell: "cmd" });
      const session = manager.getSession(info.id);

      session.createdAt.setTime(Date.now() - 5_000);

      (manager as any).cleanupExpiredSessions();
      expect(manager.activeCount).toBe(0);
    });
  });
});
