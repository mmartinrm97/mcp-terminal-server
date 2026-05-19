// @integration — requires real shell
import { describe, it, expect, afterAll } from "vitest";
import { SessionManager } from "../../src/core/session-manager.js";
import {
  handleListTools,
  handleCallTool,
  handleListResources,
  handleReadResource,
  createTerminalServer,
} from "../../src/server.js";
import type { SessionManager as SessionManagerType } from "../../src/core/session-manager.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MCP Server Integration", () => {
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

  function createManager(): SessionManager {
    const sm = new SessionManager({
      max_sessions: 10,
      session_ttl_ms: 30 * 60 * 1000,
    });
    managers.push(sm);
    return sm;
  }

  // ---------------------------------------------------------------------------
  // 1. List tools via handler
  // ---------------------------------------------------------------------------
  describe("handleListTools", () => {
    it("should return all 12 tools", async () => {
      const result = await handleListTools();
      expect(result.tools).toHaveLength(12);
    });

    it("should include all expected tool names", async () => {
      const result = await handleListTools();
      const names = result.tools.map((t: { name: string }) => t.name);
      expect(names).toContain("terminal_create_session");
      expect(names).toContain("terminal_write");
      expect(names).toContain("terminal_read");
      expect(names).toContain("terminal_read_until");
      expect(names).toContain("terminal_resize");
      expect(names).toContain("terminal_list_sessions");
      expect(names).toContain("terminal_close_session");
      expect(names).toContain("terminal_screenshot");
      expect(names).toContain("terminal_tail");
      expect(names).toContain("terminal_send_signal");
      expect(names).toContain("terminal_ping");
      expect(names).toContain("terminal_session_diagnostics");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Full session lifecycle via handlers
  // ---------------------------------------------------------------------------
  describe("full session lifecycle via handlers", () => {
    it("should complete create → write → read_until → close cycle", async () => {
      const sm = createManager();

      // 1. CREATE session
      const createResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_create_session",
        arguments: { shell: "auto" },
      });
      expect(createResult.isError).toBeFalsy();
      const createData = JSON.parse(createResult.content[0].text) as { id: string; alive: boolean };
      expect(createData.id).toBeTruthy();
      expect(createData.alive).toBe(true);
      const sessionId = createData.id;

      // 2. WRITE a marker command
      const writeResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_write",
        arguments: { id: sessionId, data: "echo ---MCP-FLOW-M1N2---\n" },
      });
      const writeData = JSON.parse(writeResult.content[0].text) as {
        ok: boolean;
        bytes_written: number;
      };
      expect(writeData.ok).toBe(true);
      expect(writeData.bytes_written).toBeGreaterThan(0);

      // 3. READ_UNTIL the marker appears
      const readUntilResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_read_until",
        arguments: { id: sessionId, pattern: "---MCP-FLOW-M1N2---", timeout_ms: 15000 },
      });
      const readUntilData = JSON.parse(readUntilResult.content[0].text) as {
        matched: string;
        timed_out: boolean;
        full_output: string;
      };
      expect(readUntilData.timed_out).toBe(false);
      expect(readUntilData.matched).toContain("MCP-FLOW-M1N2");

      // 4. CLOSE session
      const closeResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_close_session",
        arguments: { id: sessionId },
      });
      const closeData = JSON.parse(closeResult.content[0].text) as { ok: boolean };
      expect(closeData.ok).toBe(true);

      // Verify session is gone
      const listResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_list_sessions",
        arguments: {},
      });
      const listData = JSON.parse(listResult.content[0].text) as { sessions: unknown[] };
      expect(listData.sessions).toHaveLength(0);
    }, 30000);

    it("should return error for unknown tool name", async () => {
      const sm = createManager();
      const result = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "nonexistent_tool",
        arguments: {},
      });
      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0].text) as { error: string };
      expect(errorData.error).toContain("Unknown tool");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. read and resize via handlers
  // ---------------------------------------------------------------------------
  describe("read and resize via handlers", () => {
    it("should read accumulated output", async () => {
      const sm = createManager();

      // Create session
      const createResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_create_session",
        arguments: { shell: "auto" },
      });
      const createData = JSON.parse(createResult.content[0].text) as { id: string };
      const sessionId = createData.id;

      // Write a command
      await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_write",
        arguments: { id: sessionId, data: "echo ---READ-TEST-X1Y2---\n" },
      });

      // Wait for it via read_until
      await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_read_until",
        arguments: { id: sessionId, pattern: "---READ-TEST-X1Y2---", timeout_ms: 10000 },
      });

      // Now do a terminal_read to verify there's data
      const readResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_read",
        arguments: { id: sessionId, flush: false },
      });
      const readData = JSON.parse(readResult.content[0].text);
      // Should have some terminal output (prompt text, etc.)
      expect(typeof readData.data).toBe("string");

      // Close — avoid force=true on Windows (signals unsupported)
      await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_close_session",
        arguments: { id: sessionId, force: false },
      });
    }, 20000);

    it("should resize session and confirm new dimensions", async () => {
      const sm = createManager();

      const createResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_create_session",
        arguments: { shell: "auto", cols: 80, rows: 24 },
      });
      const createData = JSON.parse(createResult.content[0].text) as { id: string };
      expect(createData.id).toBeTruthy();

      const sessionId = createData.id;

      // Resize
      const resizeResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_resize",
        arguments: { id: sessionId, cols: 120, rows: 50 },
      });
      const resizeData = JSON.parse(resizeResult.content[0].text) as { cols: number; rows: number };
      expect(resizeData.cols).toBe(120);
      expect(resizeData.rows).toBe(50);

      // Close
      await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_close_session",
        arguments: { id: sessionId },
      });
    }, 15000);
  });

  // ---------------------------------------------------------------------------
  // 4. Handle list resources
  // ---------------------------------------------------------------------------
  describe("handleListResources", () => {
    it("should return 4 resources", async () => {
      const result = await handleListResources();
      expect(result.resources).toHaveLength(4);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Handle read resource with real sessions
  // ---------------------------------------------------------------------------
  describe("handleReadResource", () => {
    it("should return sessions list for terminal://sessions", async () => {
      const sm = createManager();

      // Create a session first
      await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_create_session",
        arguments: { shell: "auto" },
      });

      const result = await handleReadResource(sm as unknown as SessionManagerType, {
        uri: "terminal://sessions",
      });
      const sessions = JSON.parse(result.contents[0].text) as unknown[];
      expect(sessions.length).toBe(1);
    });

    it("should return status for terminal://sessions/{id}/status", async () => {
      const sm = createManager();

      const createResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_create_session",
        arguments: { shell: "auto" },
      });
      const createData = JSON.parse(createResult.content[0].text) as { id: string };
      const sessionId = createData.id;

      const result = await handleReadResource(sm as unknown as SessionManagerType, {
        uri: `terminal://sessions/${sessionId}/status`,
      });
      const status = JSON.parse(result.contents[0].text) as { id: string; alive: boolean };
      expect(status.id).toBe(sessionId);
      expect(status.alive).toBe(true);
    });

    it("should return buffer content for terminal://sessions/{id}/buffer", async () => {
      const sm = createManager();

      const createResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_create_session",
        arguments: { shell: "auto" },
      });
      const createData = JSON.parse(createResult.content[0].text) as { id: string };
      const sessionId = createData.id;

      const result = await handleReadResource(sm as unknown as SessionManagerType, {
        uri: `terminal://sessions/${sessionId}/buffer`,
      });
      const buffer = JSON.parse(result.contents[0].text) as { data: string; ended: boolean };
      expect(typeof buffer.data).toBe("string");
      expect(typeof buffer.ended).toBe("boolean");
    });

    it("should return events for terminal://sessions/{id}/events", async () => {
      const sm = createManager();

      const createResult = await handleCallTool(sm as unknown as SessionManagerType, {
        name: "terminal_create_session",
        arguments: { shell: "auto" },
      });
      const createData = JSON.parse(createResult.content[0].text) as { id: string };
      const sessionId = createData.id;

      const result = await handleReadResource(sm as unknown as SessionManagerType, {
        uri: `terminal://sessions/${sessionId}/events`,
      });
      const payload = JSON.parse(result.contents[0].text) as { events: Array<{ type: string }> };
      expect(payload.events.length).toBeGreaterThan(0);
      expect(payload.events[0].type).toBe("session_created");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. createTerminalServer smoke test
  // ---------------------------------------------------------------------------
  describe("createTerminalServer", () => {
    it("should create a fully configured MCP server instance", () => {
      const sm = createManager();
      const server = createTerminalServer(sm);

      // The server should be created successfully
      expect(server).toBeDefined();
      // The MCP Server instance should have the standard properties
      expect(typeof server.connect).toBe("function");
      expect(typeof server.close).toBe("function");
    });
  });
});
