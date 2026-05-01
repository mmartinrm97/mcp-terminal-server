#!/usr/bin/env node

/**
 * MCP Terminal Server — Interactive Terminal for AI Agents
 *
 * Usage:
 *   mcp-terminal-server           Start the MCP server (stdio transport)
 *   mcp-terminal-server setup     Configure MCP in opencode.json
 *   mcp-terminal-server install-skills  Install agent skills
 *
 * See docs/MCP-TERMINAL-SERVER.md for the full design.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { SessionManager } from "./core/session-manager.js";
import { createTerminalServer } from "./server.js";
import type { SessionManagerConfig } from "./types.js";

const PKG_VERSION = "0.1.3";

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
  const max = parseEnvInt("MCP_TERMINAL_MAX_SESSIONS", DEFAULT_CONFIG.max_sessions);
  const ttl = parseEnvInt("MCP_TERMINAL_SESSION_TTL_MS", DEFAULT_CONFIG.session_ttl_ms);

  return { max_sessions: max, session_ttl_ms: ttl };
}

/** Parse an environment variable as an integer with a fallback default. */
function parseEnvInt(envKey: string, defaultVal: number): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw === "") return defaultVal;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

// ---------------------------------------------------------------------------
// Skill installation path
// ---------------------------------------------------------------------------

/** Get the path of the interactive-terminal SKILL.md */
function getSkillPath(): string {
  // When running from dist/, skills are at ../skills/interactive-terminal/SKILL.md
  const distDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = join(distDir, "..");
  const skillPath = join(projectRoot, "skills", "interactive-terminal", "SKILL.md");

  if (existsSync(skillPath)) {
    return skillPath;
  }

  // Fallback: check cwd/skills
  const cwdSkillPath = join(process.cwd(), "skills", "interactive-terminal", "SKILL.md");
  if (existsSync(cwdSkillPath)) {
    return cwdSkillPath;
  }

  return skillPath; // return the default even if it doesn't exist
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Resolve which opencode.json to use — interactive select */
async function resolveConfigPath(): Promise<string> {
  const cwd = process.cwd();
  const projectPath = join(cwd, "opencode.json");
  const globalPath = join(homedir(), ".config", "opencode", "opencode.json");

  const projectExists = existsSync(projectPath);
  const globalExists = existsSync(globalPath);

  // Neither exists
  if (!projectExists && !globalExists) {
    p.log.error("No opencode.json found.");
    p.log.info(`  Project:  ${projectPath}`);
    p.log.info(`  Global:   ${globalPath}`);
    p.log.info("Create one first, then run setup again.");
    process.exit(1);
  }

  const options: { label: string; value: string; hint?: string }[] = [];

  if (projectExists) {
    options.push({ label: "Project", value: projectPath, hint: projectPath });
  } else {
    options.push({ label: "Project", value: projectPath, hint: `${projectPath} (crear nuevo)` });
  }

  if (globalExists) {
    options.push({ label: "Global", value: globalPath, hint: globalPath });
  } else {
    options.push({ label: "Global", value: globalPath, hint: `${globalPath} (crear nuevo)` });
  }

  const selected = await p.select({
    message: "Which opencode.json do you want to configure?",
    options,
  });

  if (p.isCancel(selected)) {
    p.outro("Cancelled.");
    process.exit(0);
  }

  return selected as string;
}

/** Install the MCP Terminal Server in opencode.json */
async function cmdSetup(): Promise<void> {
  p.intro("MCP Terminal Server Setup");

  const configPath = await resolveConfigPath();

  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);

  // Ensure mcp section exists
  if (!config.mcp) {
    config.mcp = {};
  }

  // Get the server executable path
  const serverPath = process.argv[1]; // path to dist/index.js

  // Determine the best command based on how the server was invoked
  const isNpxRun = process.argv[1].includes("_npx");
  const serverCommand = isNpxRun ? ["npx", "mcp-terminal-server"] : ["node", serverPath];

  // Add terminal server config (don't overwrite if already exists)
  if (!config.mcp.terminal) {
    config.mcp.terminal = {
      command: serverCommand,
      type: "local",
      enabled: true,
    };
    p.log.success("Added terminal MCP server to opencode.json");
  } else {
    p.log.info("Terminal MCP server already configured in opencode.json");
  }

  // Write back
  writeFileSync(configPath, JSON.stringify(config, null, 4) + "\n", "utf-8");
  p.outro(`Updated ${configPath}`);
}

/** Install the interactive-terminal skill for AI agents */
function cmdInstallSkills(): void {
  const skillPath = getSkillPath();

  if (!existsSync(skillPath)) {
    console.error(`[mcp-terminal-server] Skill not found at ${skillPath}`);
    console.error("[mcp-terminal-server] Make sure skills/interactive-terminal/SKILL.md exists");
    process.exit(1);
  }

  // Check for common agent config directories
  const agents = [
    { name: "Claude Code", dir: join(homedir(), ".claude", "skills") },
    { name: "OpenCode", dir: join(homedir(), ".config", "opencode", "skills") },
    { name: "Cursor", dir: join(homedir(), ".cursor", "skills") },
    { name: "Gemini CLI", dir: join(homedir(), ".gemini", "skills") },
  ];

  let installed = 0;
  for (const agent of agents) {
    if (existsSync(dirname(agent.dir))) {
      // Create skills dir if needed
      if (!existsSync(agent.dir)) {
        mkdirSync(agent.dir, { recursive: true });
      }

      // Symlink or copy the skill
      const targetDir = join(agent.dir, "interactive-terminal");
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
        const targetFile = join(targetDir, "SKILL.md");
        const skillContent = readFileSync(skillPath, "utf-8");
        writeFileSync(targetFile, skillContent, "utf-8");
        console.log(`[mcp-terminal-server] ✅ Installed skill for ${agent.name}`);
        installed++;
      } else {
        console.log(`[mcp-terminal-server] ⏭️  Skill already installed for ${agent.name}`);
      }
    }
  }

  if (installed === 0) {
    console.log("[mcp-terminal-server] ⚠️  No supported AI agent config directories found.");
    console.log("[mcp-terminal-server]    You can manually copy the skill from:");
    console.log(`[mcp-terminal-server]    ${skillPath}`);
  }

  // Also note the skills.sh compatibility
  console.log("");
  console.log("[mcp-terminal-server] 📌 To add via skills.sh:");
  console.log(
    `[mcp-terminal-server]    npx skills add <YOUR_GITHUB_REPO_URL> --skill interactive-terminal`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "setup") {
    await cmdSetup();
    return;
  }

  if (command === "install-skills") {
    cmdInstallSkills();
    return;
  }

  if (command === "--help" || command === "-h") {
    console.log(`
MCP Terminal Server v${PKG_VERSION}

Usage:
  mcp-terminal-server              Start MCP server (stdio transport)
  mcp-terminal-server setup        Configure MCP in opencode.json
  mcp-terminal-server install-skills  Install agent skills
  mcp-terminal-server --help       Show this help
`);
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(PKG_VERSION);
    return;
  }

  // Default: start the MCP server
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
    process.stderr.write("[mcp-terminal-server] Connected via stdio transport\n");
  } catch (err) {
    process.stderr.write(`[mcp-terminal-server] Failed to connect: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = () => {
    process.stderr.write("[mcp-terminal-server] Shutting down...\n");
    sessionManager.dispose();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Only start when run directly (not imported in tests)
if (!process.env.VITEST) {
  main().catch((err) => {
    process.stderr.write(`[mcp-terminal-server] Fatal error: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
