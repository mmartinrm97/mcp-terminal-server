#!/usr/bin/env node

/**
 * terminalize — Interactive Terminal for AI Agents
 *
 * Usage:
 *   terminalize                  Start the MCP server (stdio transport)
 *   terminalize install-skills   Install the terminalize agent skill
 *   terminalize --help           Show help
 *   terminalize --version        Show version
 *
 * See README.md for setup instructions.
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

const PKG_VERSION = "0.2.4";

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

/** Get the path of the terminalize SKILL.md */
function getSkillPath(): string {
  // When running from dist/, skills are at ../skills/terminalize/SKILL.md
  const distDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = join(distDir, "..");
  const skillPath = join(projectRoot, "skills", "terminalize", "SKILL.md");

  if (existsSync(skillPath)) {
    return skillPath;
  }

  // Fallback: check cwd/skills
  const cwdSkillPath = join(process.cwd(), "skills", "terminalize", "SKILL.md");
  if (existsSync(cwdSkillPath)) {
    return cwdSkillPath;
  }

  return skillPath; // return the default even if it doesn't exist
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Agent definitions and skill installer
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Agent definitions shared between discovery and install
// ---------------------------------------------------------------------------

interface AgentDef {
  value: string;
  name: string;
  /** Config dir under home (e.g. ".claude", ".config/opencode"). */
  configSubdir: string;
  /** If true, project-level uses .agents/skills (universal). */
  universal: boolean;
}

/** Known agents — matches the skills.sh registry. */
const ALL_AGENTS: AgentDef[] = [
  // Universal agents (project-level → .agents/skills/)
  { value: "opencode", name: "OpenCode", configSubdir: ".config/opencode", universal: true },
  { value: "cursor", name: "Cursor", configSubdir: ".cursor", universal: true },
  { value: "gemini", name: "Gemini CLI", configSubdir: ".gemini", universal: true },
  { value: "codex", name: "Codex", configSubdir: ".codex", universal: true },
  { value: "kimi", name: "Kimi Code", configSubdir: ".kimi", universal: true },
  { value: "copilot", name: "GitHub Copilot", configSubdir: ".copilot", universal: true },
  { value: "cline", name: "Cline", configSubdir: ".cline", universal: true },
  // Non-universal agents (project-level → own dir)
  { value: "claude", name: "Claude Code", configSubdir: ".claude", universal: false },
  { value: "kiro", name: "Kiro CLI", configSubdir: ".kiro", universal: false },
  { value: "kilocode", name: "Kilo Code", configSubdir: ".kilocode", universal: false },
  { value: "windsurf", name: "Windsurf", configSubdir: ".codeium/windsurf", universal: false },
  { value: "qwen", name: "Qwen Code", configSubdir: ".qwen", universal: false },
];

/**
 * Resolve the skills directory for an agent.
 * At project level, universal agents all share .agents/skills.
 */
function agentSkillsDir(agent: AgentDef, global: boolean, baseDir: string): string {
  if (!global && agent.universal) {
    return join(baseDir, ".agents", "skills", "terminalize");
  }
  return join(baseDir, agent.configSubdir, "skills", "terminalize");
}

/** Detect which agents have their config dir under a given base. */
function detectAgentsAt(baseDir: string, global: boolean): AgentDef[] {
  // At project level, always offer universal .agents/skills
  if (!global) {
    const nonUniversal = ALL_AGENTS.filter(
      (a) => !a.universal && existsSync(join(baseDir, a.configSubdir)),
    );
    const universal: AgentDef = {
      value: "universal",
      name: "Universal (.agents/skills)",
      configSubdir: ".agents",
      universal: true,
    };
    return [universal, ...nonUniversal];
  }

  // Global level: check each agent's config dir
  return ALL_AGENTS.filter((a) => existsSync(join(baseDir, a.configSubdir)));
}

/** Install the terminalize skill for AI agents */
async function cmdInstallSkills(args: { verbose?: boolean; yes?: boolean } = {}): Promise<void> {
  p.intro("terminalize Skill Install");

  const skillPath = getSkillPath();

  if (!existsSync(skillPath)) {
    p.log.error(`Skill not found at ${skillPath}`);
    p.log.info("Make sure skills/terminalize/SKILL.md exists");
    process.exit(1);
  }

  // Step 1: Ask project or global
  const scope = await p.select({
    message: "Install skills at project level or globally?",
    options: [
      {
        label: "Project",
        value: "project",
        hint: `.agents/skills/ — only this project`,
      },
      {
        label: "Global",
        value: "global",
        hint: `~/.agent/skills/ — all projects`,
      },
    ],
  });

  if (p.isCancel(scope)) {
    p.outro("Cancelled.");
    process.exit(0);
  }

  const global = scope === "global";
  const baseDir = global ? homedir() : process.cwd();
  const label = global ? " (global)" : " (project)";

  // Step 2: Detect available agents
  const available = detectAgentsAt(baseDir, global);

  if (args.verbose) {
    p.log.info(`Scanning: ${baseDir}`);
    p.log.info(`Detected ${available.length} agent(s): ${available.map((a) => a.name).join(", ")}`);
  }

  if (available.length === 0) {
    p.log.warn(
      global
        ? "No supported AI agent config directories found."
        : "No agent config directories found in this project.",
    );
    p.log.info("You can manually copy the skill from:");
    p.log.info(`  ${skillPath}`);
    process.exit(0);
  }

  // Step 3: Filter already installed ones
  const alreadyInstalled = available.filter((a) => existsSync(agentSkillsDir(a, global, baseDir)));
  const toInstall = available.filter((a) => !alreadyInstalled.includes(a));

  if (toInstall.length === 0) {
    p.log.info("Skill already installed for all available agents.");
    p.outro("Nothing to do.");
    return;
  }

  // Step 4: Skip selection if -y mode and only one option available
  let selected: (string | symbol)[];

  if (toInstall.length === 1 && args.yes) {
    selected = [toInstall[0].value];
    p.log.info(`Auto-selecting: ${toInstall[0].name}`);
  } else {
    selected = (await p.multiselect({
      message: `Which agents do you want to install the skill for?${label}`,
      options: toInstall.map((a) => ({
        label: a.name,
        value: a.value,
        hint: dirname(agentSkillsDir(a, global, baseDir)),
      })),
      required: false,
    })) as (string | symbol)[];

    if (p.isCancel(selected) || selected.length === 0) {
      p.outro("Cancelled.");
      return;
    }
  }

  // Step 5: Install
  const selectedDefs = available.filter((a) => selected.includes(a.value));

  const s = p.spinner();
  s.start("Installing...");

  const installed: string[] = [];

  for (const agent of selectedDefs) {
    const targetDir = agentSkillsDir(agent, global, baseDir);
    mkdirSync(targetDir, { recursive: true });
    const targetFile = join(targetDir, "SKILL.md");
    const skillContent = readFileSync(skillPath, "utf-8");
    writeFileSync(targetFile, skillContent, "utf-8");
    s.message(`Installed for ${agent.name}`);
    installed.push(`${agent.name} → ${targetDir}`);
  }

  s.stop("Done installing skills.");
  p.outro(`Installed for ${installed.length} agent(s):`);
  for (const line of installed) {
    p.log.info(`  ${line}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const yes = args.includes("-y") || args.includes("--yes");
  // Filter out flags before processing the command
  const filteredArgs = args.filter((a) => a !== "--verbose" && a !== "-y" && a !== "--yes");
  const command = filteredArgs[0];

  if (command === "install-skills") {
    await cmdInstallSkills({ verbose, yes });
    return;
  }

  if (command === "--help" || command === "-h") {
    console.log(`
terminalize v${PKG_VERSION}

Usage:
  terminalize                   Start MCP server (stdio transport)
  terminalize install-skills    Install the terminalize skill for AI agents
  terminalize --help            Show this help
  terminalize --version         Show version
  terminalize --verbose         Show debug info (use with install-skills)
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
    `[terminalize] Starting with max_sessions=${config.max_sessions}, ` +
      `session_ttl_ms=${config.session_ttl_ms}\n`,
  );

  try {
    await server.connect(transport);
    process.stderr.write("[terminalize] Connected via stdio transport\n");
  } catch (err) {
    process.stderr.write(`[terminalize] Failed to connect: ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = () => {
    process.stderr.write("[terminalize] Shutting down...\n");
    sessionManager.dispose();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Only start when run directly (not imported in tests)
if (!process.env.VITEST) {
  main().catch((err) => {
    process.stderr.write(`[terminalize] Fatal error: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
