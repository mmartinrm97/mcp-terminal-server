// @integration — requires real shell
import { join } from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { SessionManager } from "../../src/core/session-manager.js";
import { SessionLimitError, SessionPolicyError } from "../../src/types.js";
import type { SessionConfig, SessionInfo } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionManager Integration", () => {
  let managers: SessionManager[] = [];

  afterAll(() => {
    for (const m of managers) {
      // Close all sessions gracefully first to avoid async SIGKILL errors on Windows
      for (const s of m.listSessions()) {
        try {
          m.closeSession(s.id);
        } catch {
          /* already closed */
        }
      }
      try {
        m.dispose();
      } catch {
        /* Windows — signals unsupported in node-pty */
      }
    }
  });

  /**
   * Create a SessionManager and track it for cleanup.
   */
  function createManager(config?: {
    max_sessions?: number;
    session_ttl_ms?: number;
    allowed_cwd_roots?: string[];
    command_allow_patterns?: string[];
    command_deny_patterns?: string[];
  }): SessionManager {
    const sm = new SessionManager({
      max_sessions: config?.max_sessions ?? 10,
      session_ttl_ms: config?.session_ttl_ms ?? 30 * 60 * 1000,
      allowed_cwd_roots: config?.allowed_cwd_roots ?? [],
      command_allow_patterns: config?.command_allow_patterns ?? [],
      command_deny_patterns: config?.command_deny_patterns ?? [],
    });
    managers.push(sm);
    return sm;
  }

  /**
   * Helper: create a session with default shell detection.
   */
  async function createTestSession(
    sm: SessionManager,
    overrides?: Partial<SessionConfig>,
  ): Promise<SessionInfo> {
    return sm.createSession({
      shell: "auto",
      cols: 80,
      rows: 24,
      ...overrides,
    });
  }

  // ---------------------------------------------------------------------------
  // 1. Create and list sessions
  // ---------------------------------------------------------------------------
  describe("create and list sessions", () => {
    it("should create a session and list it", async () => {
      const sm = createManager({ max_sessions: 10 });
      const info = await createTestSession(sm);

      expect(info.id).toBeTruthy();
      expect(typeof info.id).toBe("string");
      expect(info.alive).toBe(true);

      const list = sm.listSessions();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(info.id);
    });

    it("should return 2 sessions when 2 are created", async () => {
      const sm = createManager({ max_sessions: 10 });
      const info1 = await createTestSession(sm);
      const info2 = await createTestSession(sm);

      expect(info1.id).not.toBe(info2.id);

      const list = sm.listSessions();
      expect(list).toHaveLength(2);
      const ids = list.map((s) => s.id);
      expect(ids).toContain(info1.id);
      expect(ids).toContain(info2.id);
    });

    it("should report correct activeCount", async () => {
      const sm = createManager({ max_sessions: 10 });
      expect(sm.activeCount).toBe(0);

      await createTestSession(sm);
      expect(sm.activeCount).toBe(1);

      await createTestSession(sm);
      expect(sm.activeCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Session close removes from list
  // ---------------------------------------------------------------------------
  describe("session close", () => {
    it("should remove session from list after close", async () => {
      const sm = createManager({ max_sessions: 10 });
      const info = await createTestSession(sm);

      expect(sm.listSessions()).toHaveLength(1);
      expect(sm.activeCount).toBe(1);

      sm.closeSession(info.id);

      expect(sm.listSessions()).toHaveLength(0);
      expect(sm.activeCount).toBe(0);
    });

    it("should close only the specified session", async () => {
      const sm = createManager({ max_sessions: 10 });
      const info1 = await createTestSession(sm);
      const info2 = await createTestSession(sm);

      expect(sm.activeCount).toBe(2);

      sm.closeSession(info1.id);

      expect(sm.activeCount).toBe(1);
      const list = sm.listSessions();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(info2.id);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Session limit enforcement
  // ---------------------------------------------------------------------------
  describe("session limit", () => {
    it("should throw SessionLimitError when max_sessions=1 and creating second", async () => {
      const sm = createManager({ max_sessions: 1 });
      await createTestSession(sm);

      expect(sm.activeCount).toBe(1);

      await expect(createTestSession(sm)).rejects.toThrow(SessionLimitError);
    });

    it("should allow creation up to the limit", async () => {
      const sm = createManager({ max_sessions: 3 });
      await createTestSession(sm);
      await createTestSession(sm);
      await createTestSession(sm);

      expect(sm.activeCount).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. getSession
  // ---------------------------------------------------------------------------
  describe("getSession", () => {
    it("should return the PTYSession for a valid id", async () => {
      const sm = createManager({ max_sessions: 10 });
      const info = await createTestSession(sm);

      const session = sm.getSession(info.id);
      expect(session).toBeDefined();
      expect(session.id).toBe(info.id);
      expect(session.getInfo().alive).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Safety policy
  // ---------------------------------------------------------------------------
  describe("safety policy", () => {
    it("should reject session creation outside allowed cwd roots", async () => {
      const sm = createManager({
        allowed_cwd_roots: [join(process.cwd(), "safe-root")],
      });

      await expect(
        createTestSession(sm, {
          cwd: join(process.cwd(), ".."),
        }),
      ).rejects.toThrow(SessionPolicyError);
    });

    it("should reject writes blocked by command deny patterns", async () => {
      const sm = createManager({
        command_deny_patterns: ["rm\\s+-rf"],
      });
      const info = await createTestSession(sm);

      expect(() => sm.writeToSession(info.id, "rm -rf dist")).toThrow(SessionPolicyError);
    });
  });
});
