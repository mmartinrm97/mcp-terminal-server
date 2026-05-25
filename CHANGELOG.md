# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] — 2026-05-25

### Added

- **CI**: Dedicated `integration-windows-targeted` GitHub Actions job for a meaningful Windows-safe integration subset
- **Docs**: New docs hub (`docs/README.md`), dedicated MCP tool reference (`docs/MCP-TOOLS.md`), and dedicated testing/CI guide (`docs/TESTING.md`)

### Changed

- **Docs**: Rewrote `docs/ARCHITECTURE.md` to reflect the current codebase, current MCP surface, and current cross-platform/testing posture
- **Docs**: Slimmed the root `README.md` into a faster overview that links to focused docs instead of duplicating everything
- **Release**: Made release verification examples generic in `docs/RELEASE.md` so they do not drift on every patch version

### Fixed

- **Windows**: Promoted a locally verified Windows integration subset into an explicit script/CI contract (`pnpm test:int:windows`)
- **Changelog**: Corrected stale historical names for session max duration/output cap and session export terminology

### Testing

- Local validation included `pnpm test:int:windows`, `pnpm build`, and targeted CI/package-script unit checks
- Windows-targeted integration subset currently passes locally with 47 tests on this machine

## [0.5.0] — 2026-05-22

### Added

- **Efficiency**: `terminal_execute` composite tool reduces common write+wait round-trips into a single MCP call
- **Efficiency**: Benchmark suite for payload size, workflow round-trips, local handler latency, and approximate provider-side cost
- **Security**: Risk-confirmation policy for dangerous commands and package-install flows
- **Security**: Release supply-chain hardening with CycloneDX SBOM generation, SHA256 checksums, CodeQL, GitHub artifact attestations, and npm trusted publishing workflow support
- **Quality**: Release gate now enforces tests, build, dependency audit, and documented release verification steps

### Changed

- **Payloads**: `terminal_read`, `terminal_read_until`, `terminal_tail`, screenshots, and session listings now default to much smaller token-aware responses
- **Safety**: Session cwd is restricted to `process.cwd()` by default unless explicitly widened with `MCP_TERMINAL_ALLOWED_CWD_ROOTS`
- **Observability**: Diagnostics/export responses now emphasize compact summaries instead of raw verbose dumps
- **Docs**: Release, benchmarks, compatibility, and agent guidance were aligned with the current MCP surface and evidence bar

### Fixed

- **Determinism**: Non-interactive screenshot guidance no longer oscillates based only on elapsed time
- **Supply chain**: Release workflow no longer depends on legacy npm tokens and now validates checksum generation/verification paths
- **Dependencies**: Added overrides to keep transient audit findings green, including the `qs` advisory introduced by SBOM tooling

### Testing

- **405 tests** passing
- **Coverage**: 91.1% statements / 81.1% branches / 92.7% lines
- Release validation now includes dry-run packaging, SBOM generation, checksum verification, trusted-publishing-ready release workflow checks, and Sonar quality gate verification

## [0.4.0] — 2026-05-20

### Added

- **Safety**: Maximum session duration limit (`MCP_TERMINAL_SESSION_MAX_DURATION_MS`) and output size cap (`MCP_TERMINAL_OUTPUT_BUFFER_MAX_BYTES`) to prevent runaway sessions
- **Safety**: CWD and command policy guards — configurable allowlist/denylist for working directories and blocked commands
- **Observability**: Session export tooling — `terminal_session_export` returns structured session output for debugging and replay
- **Agent guidance**: Prompt heuristic detection — `session.screenshot()` surfaces UI states (menus, confirm prompts, pager indicators) so AI agents know when to send input
- **CI**: Cross-platform smoke matrix (Windows + Ubuntu + macOS) runs on every PR
- **CI**: Unix integration test matrix (Ubuntu + macOS) with real PTY sessions
- **Docs**: Installation guides for all 8 supported agents: Claude, Codex, Copilot, Cursor, Kiro, OpenCode, Pi, and Antigravity
- **Docs**: Compatibility matrix with verified cross-platform agent status
- **Docs**: Interactive flow cookbook — real examples for npm init, create-vite, gh pr create, and psql flows
- **Landing**: Brand SVG logos via SVGL API, animated typewriter terminal demo, live stats section

### Changed

- **Server**: Refactored MCP wiring and tool handlers into separate modules for clarity and testability
- **Deps**: Upgraded node-pty beta for improved Windows ConPTY stability

### Fixed

- **Quality**: All SonarQube violations resolved — Quality Gate passes at 0 issues, coverage >90%
- **Quality**: Eliminated 7 security hotspots (regex ReDoS, `execFileSync` migration, `randomBytes` for secure IDs)
- **TypeScript**: Resolved TS2591, TS2322, and S4325 errors in integration test suite
- **CI**: Stabilized macOS integration tests — poll loop replaces fixed `sleep()` after `close()`, `readUntil()` replaces `sleep()+screenshot()` in create-vite TUI flow
- **CI**: `IS_WINDOWS` guard for large-output trimming test (ConPTY inserts ANSI wrap sequences that break byte-count assertions)

### Testing

- **302 unit tests** passing (up from 265 in v0.3.0)
- **Coverage**: 90.84% lines (up from 89%)
- Cross-platform integration validated: Windows ConPTY + Linux PTY + macOS PTY

## [0.1.0] — 2026-04-30

### Added

- **Core**: `OutputBuffer` — circular buffer with regex pattern matching (50ms polling, 1MB max, FIFO trimming)
- **Core**: `PTYSession` — node-pty wrapper with write/read/readUntil/resize/close operations
- **Core**: `SessionManager` — session lifecycle manager (max 10 sessions, 30min TTL cleanup)
- **MCP Server**: 7 tools exposed via `@modelcontextprotocol/sdk`:
  - `terminal_create_session` — create interactive terminal session
  - `terminal_write` — write keystrokes/commands
  - `terminal_read` — read current buffer contents
  - `terminal_read_until` — read until regex pattern matches (⭐ key tool)
  - `terminal_resize` — change terminal dimensions
  - `terminal_list_sessions` — list active sessions
  - `terminal_close_session` — close and cleanup session
- **MCP Resources**: 3 resources for session inspection (`terminal://sessions`, `.../{id}/buffer`, `.../{id}/status`)
- **Shell detection**: Cross-platform auto-detection (Windows: pwsh/cmd, Unix: $SHELL/bash/zsh)
- **ANSI stripping**: Comprehensive regex for CSI and OSC escape sequences
- **Configuration**: Env-based (`MCP_TERMINAL_MAX_SESSIONS`, `MCP_TERMINAL_SESSION_TTL_MS`)
- **Graceful shutdown**: SIGINT/SIGTERM handlers with session cleanup

### Testing

- **132 unit tests**: All core modules with mocked node-pty
- **42 integration tests**: Real PTY sessions on Windows ConPTY:
  - Echo command execution and output capture
  - Sequential write/read cycles
  - `readUntil` pattern matching (simple, regex, multi-line, timeout)
  - Session lifecycle (create, list, close, force close)
  - Real executables (npx version, npx create-vite --help, node -e)
  - Ctrl+C interrupt of long-running processes
  - MCP server full pipeline (create → write → read_until → close)
  - Session limit enforcement
- **Strict TDD Mode**: All tests written before implementation

### Infrastructure

- TypeScript 5.8+ with NodeNext module resolution
- Vitest 3.x test runner
- oxlint 1.62.0 linter (94 rules, 0 warnings)
- oxfmt 0.47.0 formatter
- pnpm package manager
- Engram persistent memory for SDD workflow
