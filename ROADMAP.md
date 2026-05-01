# Roadmap

## v0.1 — Current (MVP)

- ✅ 11 MCP tools for interactive terminal management
- ✅ Cross-platform shell detection (Windows cmd/pwsh, Unix bash/zsh)
- ✅ Escape sequence normalization (`\n`, `\x03`, etc.)
- ✅ ANSI screen rendering (`terminal_screenshot`)
- ✅ Token-efficient log reading (`terminal_tail`)
- ✅ Signal handling (`terminal_send_signal`)
- ✅ Session labels for multi-agent flows
- ✅ Health check (`terminal_ping`)
- ✅ 203 tests (161 unit + 42 integration)
- ✅ Linter (oxlint) + formatter (oxfmt)
- ✅ MIT License
- ✅ interactive-terminal skill for AI agents

## v0.2 — Platform & Distribution

- [x] Publish to npm as `mcp-terminal-server`
- [x] `mcp-terminal-server setup` — one-command configuration
- [x] `mcp-terminal-server install-skills` — install skills for AI agents
- [ ] Test on **Linux** (Ubuntu, Debian, Fedora)
- [ ] Test on **macOS** (Intel + Apple Silicon)
- [ ] Test with **Claude Code**
- [ ] Test with **GitHub Copilot**
- [ ] Test with **Cursor**
- [ ] CI: GitHub Actions (build + test on Ubuntu, macOS, Windows)
- [ ] GitHub repository setup

## v0.3 — Cross-Platform Hardening

- [ ] PowerShell detection improvements (Windows)
- [ ] node-pty native build troubleshooting guide
- [ ] Fallback strategies for environments without node-pty
- [ ] SSH/remote session support
- [ ] Session persistence across MCP server restarts
- [ ] Config file (`mcp-terminal-server.config.json`)

## v0.4 — Agent Experience

- [ ] Skill auto-detection via `npx autoskills` integration
- [ ] skills.sh compatible skill registration
- [ ] Pre-built patterns for common CLIs:
  - `npm init`, `npm create`
  - `gh pr create`, `gh issue`
  - `npx create-vite`, `npx create-next-app`
  - `npx prisma init`, `prisma db reset`
  - `npx shadcn-vue init`
  - `psql`, `mysql`
  - `git rebase -i`
- [ ] `terminal_wait` — wait for process to finish (exit code)
- [ ] Clipboard integration (copy from terminal output)

## v0.5 — Performance & Reliability

- [ ] Log rotation strategy (configurable per-session)
- [ ] Buffer compression for large outputs
- [ ] Read timeout monitoring
- [ ] Session leak detection
- [ ] Benchmarks (latency, memory, throughput)
- [ ] SSE transport for remote MCP connections

## Future Ideas

- OpenCode core PR: native terminal tools (no MCP needed)
- Web dashboard for session monitoring
- Recording/replay of terminal sessions
- Collaborative terminal sharing between agents
