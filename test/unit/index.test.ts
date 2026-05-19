import { describe, it, expect, afterEach } from "vitest";
import { parseEnvConfig } from "../../src/index.js";

describe("index — parseEnvConfig", () => {
  const OLD_ENV = { ...process.env };

  afterEach(() => {
    // Restore original env
    process.env = { ...OLD_ENV };
  });

  it("should return defaults when no env vars set", () => {
    delete process.env.MCP_TERMINAL_MAX_SESSIONS;
    delete process.env.MCP_TERMINAL_SESSION_TTL_MS;

    const config = parseEnvConfig();
    expect(config).toEqual({
      max_sessions: 10,
      session_ttl_ms: 30 * 60 * 1000,
      allowed_cwd_roots: [],
      command_allow_patterns: [],
      command_deny_patterns: [],
    });
  });

  it("should parse MCP_TERMINAL_MAX_SESSIONS from env", () => {
    process.env.MCP_TERMINAL_MAX_SESSIONS = "5";
    delete process.env.MCP_TERMINAL_SESSION_TTL_MS;

    const config = parseEnvConfig();
    expect(config.max_sessions).toBe(5);
    expect(config.session_ttl_ms).toBe(30 * 60 * 1000);
  });

  it("should parse MCP_TERMINAL_SESSION_TTL_MS from env", () => {
    delete process.env.MCP_TERMINAL_MAX_SESSIONS;
    process.env.MCP_TERMINAL_SESSION_TTL_MS = "60000";

    const config = parseEnvConfig();
    expect(config.max_sessions).toBe(10);
    expect(config.session_ttl_ms).toBe(60000);
  });

  it("should parse both env vars together", () => {
    process.env.MCP_TERMINAL_MAX_SESSIONS = "3";
    process.env.MCP_TERMINAL_SESSION_TTL_MS = "120000";

    const config = parseEnvConfig();
    expect(config).toEqual({
      max_sessions: 3,
      session_ttl_ms: 120000,
      allowed_cwd_roots: [],
      command_allow_patterns: [],
      command_deny_patterns: [],
    });
  });

  it("should handle invalid numeric env vars by using defaults", () => {
    process.env.MCP_TERMINAL_MAX_SESSIONS = "not-a-number";
    process.env.MCP_TERMINAL_SESSION_TTL_MS = "also-bad";

    const config = parseEnvConfig();
    expect(config.max_sessions).toBe(10);
    expect(config.session_ttl_ms).toBe(30 * 60 * 1000);
  });

  it("should handle empty string env vars by using defaults", () => {
    process.env.MCP_TERMINAL_MAX_SESSIONS = "";
    process.env.MCP_TERMINAL_SESSION_TTL_MS = "";

    const config = parseEnvConfig();
    expect(config.max_sessions).toBe(10);
    expect(config.session_ttl_ms).toBe(30 * 60 * 1000);
  });

  it("should parse safety policy env vars", () => {
    process.env.MCP_TERMINAL_ALLOWED_CWD_ROOTS = "/workspace;/safe";
    process.env.MCP_TERMINAL_COMMAND_ALLOW_PATTERNS = "^echo\\b;;^pwd\\b";
    process.env.MCP_TERMINAL_COMMAND_DENY_PATTERNS = "rm\\s+-rf;;git\\s+reset\\s+--hard";

    const config = parseEnvConfig();
    expect(config.allowed_cwd_roots).toEqual(["/workspace", "/safe"]);
    expect(config.command_allow_patterns).toEqual(["^echo\\b", "^pwd\\b"]);
    expect(config.command_deny_patterns).toEqual(["rm\\s+-rf", "git\\s+reset\\s+--hard"]);
  });
});
