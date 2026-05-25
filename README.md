# terminalize

<p align="center">
  <img src="https://img.shields.io/badge/terminalize-v0.5.1-6C5CE7?style=for-the-badge&logo=window-terminal&logoColor=white" alt="terminalize" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/terminalize"><img src="https://img.shields.io/npm/v/terminalize?color=red&logo=npm&style=flat-square" /></a>
  <img src="https://img.shields.io/badge/node.js-22%2B-339933?logo=node.js&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/typescript-5.8%2B-3178C6?logo=typescript&logoColor=white&style=flat-square" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
</p>

> **Interactive terminal sessions for AI agents over MCP.**

Give your agents a persistent terminal they can actually talk to:

- real PTY sessions
- prompt-aware reads and semantic screenshots
- interactive flows like `npm init`, `gh pr create`, `create-vite`, and `psql`

[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.29-blueviolet)](https://spec.modelcontextprotocol.io)
[![node-pty](https://img.shields.io/badge/node--pty-1.2.0--beta.13-FF6C37)](https://github.com/microsoft/node-pty)
[![npm](https://img.shields.io/npm/v/terminalize?color=red)](https://www.npmjs.com/package/terminalize)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-verified-2EA043?style=flat-square)](./docs/COMPATIBILITY.md)
[![Cursor](https://img.shields.io/badge/Cursor-verified-2EA043?style=flat-square)](./docs/COMPATIBILITY.md)
[![Codex](https://img.shields.io/badge/Codex-verified-2EA043?style=flat-square)](./docs/COMPATIBILITY.md)
[![Kiro CLI](https://img.shields.io/badge/Kiro%20CLI-verified-2EA043?style=flat-square)](./docs/COMPATIBILITY.md)
[![Antigravity CLI](https://img.shields.io/badge/Antigravity-verified-2EA043?style=flat-square)](./docs/COMPATIBILITY.md)
[![GitHub Copilot CLI](https://img.shields.io/badge/Copilot-verified-2EA043?style=flat-square)](./docs/COMPATIBILITY.md)
[![Pi](https://img.shields.io/badge/Pi-verified-2EA043?style=flat-square)](./docs/COMPATIBILITY.md)

---

## Why terminalize exists

Most AI terminal tools are still **one-shot and non-interactive**.
That breaks the moment a command needs a real TTY, persistent stdin, or prompt-by-prompt input.

terminalize exposes a real PTY as MCP tools so the agent can:

1. create a session
2. write commands or keys
3. wait for the next prompt or TUI state
4. respond correctly
5. close the session cleanly

## Quick start

```bash
# Run directly
npx terminalize

# Or install globally
npm install -g terminalize
```

### Recommended first setup

```bash
# 1. Install terminalize skills/guides for your agents
npx terminalize install-skills

# 2. Follow the client-specific installation guide

# 3. Start the MCP server in your project
npx terminalize
```

## Installation guides

Use the dedicated client guides instead of copying random config blocks:

- [Installation guides index](./docs/installation-guides/README.md)
- [OpenAI Codex](./docs/installation-guides/install-codex.md)
- [Claude Code](./docs/installation-guides/install-claude.md)
- [Cursor](./docs/installation-guides/install-cursor.md)
- [GitHub Copilot CLI](./docs/installation-guides/install-copilot.md)
- [Kiro CLI](./docs/installation-guides/install-kiro.md)
- [OpenCode](./docs/installation-guides/install-opencode.md)
- [Antigravity CLI](./docs/installation-guides/install-antigravity.md)
- [Pi](./docs/installation-guides/install-pi.md)

## Public API contract

terminalize publishes an explicit MCP compatibility contract:

- **core tools** are the stable long-term integration surface
- **advanced tools** are stable too, but more diagnostic/operator-focused
- breaking renames/removals require a **major version**

Read:

- [API contract](./docs/API-CONTRACT.md)
- [Detailed MCP tool reference](./docs/MCP-TOOLS.md)

## What to read next

| I want to...                         | Read                                             |
| ------------------------------------ | ------------------------------------------------ |
| understand the internal architecture | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)   |
| integrate against the MCP surface    | [docs/API-CONTRACT.md](./docs/API-CONTRACT.md)   |
| see every tool and usage pattern     | [docs/MCP-TOOLS.md](./docs/MCP-TOOLS.md)         |
| follow interactive examples          | [docs/COOKBOOK.md](./docs/COOKBOOK.md)           |
| verify client support                | [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md) |
| understand testing/CI coverage       | [docs/TESTING.md](./docs/TESTING.md)             |
| review performance and profiling     | [docs/BENCHMARKS.md](./docs/BENCHMARKS.md)       |
| understand security boundaries       | [docs/THREAT-MODEL.md](./docs/THREAT-MODEL.md)   |
| publish a release                    | [docs/RELEASE.md](./docs/RELEASE.md)             |
| browse the docs hub                  | [docs/README.md](./docs/README.md)               |

## Prerequisites

- **Node.js 22+**
- native build support for `node-pty`
  - **Windows**: Visual Studio Build Tools / MSVC
  - **Linux**: `make`, `gcc`, `python3`
  - **macOS**: Xcode Command Line Tools

## Environment variables

| Variable                               | Default         | Description                          |
| -------------------------------------- | --------------- | ------------------------------------ |
| `MCP_TERMINAL_MAX_SESSIONS`            | `10`            | Maximum simultaneous sessions        |
| `MCP_TERMINAL_SESSION_TTL_MS`          | `1800000`       | Inactivity TTL                       |
| `MCP_TERMINAL_SESSION_MAX_DURATION_MS` | unset           | Optional hard max session lifetime   |
| `MCP_TERMINAL_OUTPUT_BUFFER_MAX_BYTES` | `1048576`       | Retained PTY output cap per session  |
| `MCP_TERMINAL_ALLOWED_CWD_ROOTS`       | `process.cwd()` | Optional `;`-separated allowed roots |
| `MCP_TERMINAL_COMMAND_ALLOW_PATTERNS`  | empty           | Optional `;;`-separated allowlist    |
| `MCP_TERMINAL_COMMAND_DENY_PATTERNS`   | empty           | Optional `;;`-separated denylist     |

## Security posture

terminalize is powerful because it gives an agent a real shell.
That means the correct question is not “can it run commands?” — of course it can.
The real question is whether the **workspace, credentials, and runtime boundary** are appropriate for that level of power.

Read before using it in shared or sensitive environments:

- [Threat model](./docs/THREAT-MODEL.md)

## Testing posture

Current validation strategy:

- smoke coverage on **Windows, Linux, and macOS**
- full integration on **Ubuntu and macOS**
- targeted deeper integration on **Windows** for PTY/session/executable/MCP-server behavior
- opt-in deep flows for credentialed or infrastructure-heavy cases

Details:

- [Testing and CI coverage](./docs/TESTING.md)
- [Benchmarks and profiling](./docs/BENCHMARKS.md)

## Limitations

terminalize gives agents a real **text-based** PTY, not a pixel-perfect desktop UI.

- great for shells, prompts, CLIs, and many TUIs
- workable but slower/riskier for editors like `vim`, `nano`, or `helix`
- not a substitute for stronger sandboxing if you need hostile-environment isolation

## Release

Before publishing a new version, use the checklist in:

- [docs/RELEASE.md](./docs/RELEASE.md)

## License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more information.
