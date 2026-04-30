#!/usr/bin/env node

/**
 * MCP Terminal Server — Interactive Terminal for AI Agents
 *
 * Exposes 7 MCP tools for managing interactive terminal sessions via PTY.
 * See docs/MCP-TERMINAL-SERVER.md for the full design.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SessionManager } from './session-manager.js';
import { createTerminalServer } from './server.js';
import type { SessionManagerConfig } from './types.js';

// ---------------------------------------------------------------------------
// Configuration via environment variables
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: SessionManagerConfig = {
  max_sessions: 10,
  session_ttl_ms: 30 * 60 * 1000, // 30 minutes
};

/**
 * Parse server configuration from environment variables.
 * Exported for testing.
 */
export function parseEnvConfig(): SessionManagerConfig {
  const max = parseEnvInt('MCP_TERMINAL_MAX_SESSIONS', DEFAULT_CONFIG.max_sessions);
  const ttl = parseEnvInt('MCP_TERMINAL_SESSION_TTL_MS', DEFAULT_CONFIG.session_ttl_ms);

  return { max_sessions: max, session_ttl_ms: ttl };
}

/** Parse an environment variable as an integer with a fallback default. */
function parseEnvInt(envKey: string, defaultVal: number): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return defaultVal;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

/**
 * Start the MCP Terminal Server.
 *
 * 1. Parse configuration from env vars
 * 2. Create SessionManager
 * 3. Create and configure MCP Server
 * 4. Connect via StdioServerTransport
 */
async function main(): Promise<void> {
  const config = parseEnvConfig();

  const sessionManager = new SessionManager(config);
  const server = createTerminalServer(sessionManager);

  const transport = new StdioServerTransport();

  // Log startup to stderr (MCP uses stdout for transport)
  process.stderr.write(
    `[mcp-terminal-server] Starting with max_sessions=${config.max_sessions}, ` +
      `session_ttl_ms=${config.session_ttl_ms}\n`,
  );

  try {
    await server.connect(transport);
    process.stderr.write('[mcp-terminal-server] Connected via stdio transport\n');
  } catch (err) {
    process.stderr.write(
      `[mcp-terminal-server] Failed to connect: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = () => {
    process.stderr.write('[mcp-terminal-server] Shutting down...\n');
    sessionManager.dispose();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Only start the server when this file is run directly (not imported in tests)
// Vitest sets VITEST env var when running tests
if (!process.env.VITEST) {
  main().catch((err) => {
    process.stderr.write(
      `[mcp-terminal-server] Fatal error: ${(err as Error).message}\n`,
    );
    process.exit(1);
  });
}
