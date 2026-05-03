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
- ✅ 235 tests (193 unit + 42 integration)
- ✅ Linter (oxlint) + formatter (oxfmt)
- ✅ MIT License
- ✅ terminalize skill for AI agents

## v0.2 — Platform & Distribution

- [x] Publish to npm as `terminalize`
- [x] `terminalize install-skills` — install skills for AI agents
- [ ] Config file (`terminalize.config.json`)

## v0.3 — Cross-platform Testing

- [ ] **Linux**: full test suite + interactive TUI smoke test (bash)
- [ ] **macOS**: full test suite + interactive TUI smoke test (zsh)
- [ ] **Claude Code** — MCP config + skill install + real TUI commands
- [ ] **Cursor** — MCP config + skill install
- [ ] **Gemini CLI** — MCP config + skill install
- [ ] **Windsurf** — MCP config + skill install
- [ ] **Kiro CLI** — MCP config + skill install
- [ ] **Windows PowerShell Core** — verify pwsh detection works
- [ ] TUI smoke tests: `npm init`, `gh pr create`, `npx create-vite`, `psql`
- [ ] `terminal_screenshot` rendering comparison across platforms

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
