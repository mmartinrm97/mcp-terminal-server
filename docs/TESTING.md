# terminalize Testing and CI

This document explains what is currently validated, where, and why.

## Local commands

```bash
pnpm test
pnpm test:unit
pnpm test:int
pnpm test:int:windows
pnpm test:smoke
pnpm build
pnpm lint
```

## CI layers

### 1. Dependency hygiene

Runs on Ubuntu:

- frozen install
- dependency audit

### 2. Cross-platform smoke matrix

Runs on:

- Windows
- Linux
- macOS

Smoke scope:

- create auto-shell session
- write/read a marker command
- verify screenshot rendering
- interrupt a long-running command
- close a long-running session cleanly

### 3. Full Unix integration

Runs on:

- Ubuntu
- macOS

Coverage includes:

- prompt-by-prompt reads
- signal recovery
- long-output handling
- executable checks
- PTY lifecycle behavior

### 4. Targeted Windows integration

Runs on:

- Windows

Current Windows-targeted suite:

- `test/integration/ci-smoke.int.test.ts`
- `test/integration/pty-session.int.test.ts`
- `test/integration/executables.int.test.ts`
- `test/integration/mcp-server.int.test.ts`

This is intentionally deeper than smoke, but narrower than Unix full integration. The goal is to keep real ConPTY confidence in CI without pretending every Unix-style interactive case is equally stable on Windows.

## Why Windows is still narrower than Unix

Some prompt-by-prompt Node/TUI flows remain less deterministic under ConPTY than under Unix PTYs.

That means:

- we **do** verify real PTY lifecycle, signals, command execution, and MCP server behavior on Windows
- we **do not** overclaim that every deeper interactive flow should be identical to Unix in CI

That is the honest engineering posture.

## Opt-in deep interactive validation

Some flows depend on credentials or local infrastructure, so they stay opt-in:

- `gh pr create --draft --dry-run`
- Docker-backed `psql`

PowerShell:

```powershell
$env:TERMINALIZE_RUN_GH_INTERACTIVE = "1"
pnpm vitest run test/integration/executables.int.test.ts -t "gh pr create"
```

Unix-like shell:

```bash
TERMINALIZE_RUN_DOCKER_PSQL=1 pnpm vitest run test/integration/executables.int.test.ts -t "docker-backed psql"
```

## Profiling and benchmarks

Use these when you want evidence beyond pass/fail:

```bash
pnpm bench:payload
pnpm bench:workflow
pnpm bench:latency
pnpm bench:cost
pnpm profile:buffer
```

More details live in [./BENCHMARKS.md](./BENCHMARKS.md).

## Failure triage

When an interactive run fails in a confusing way:

1. call `terminal_session_export`
2. attach the JSON payload to the issue
3. inspect transcript, recent events, and the final semantic screenshot

## Bottom line

The test strategy is layered on purpose:

- cheap smoke everywhere
- full integration where the platform is stable enough to support it credibly
- targeted Windows coverage where it matters most
- opt-in deep flows when credentials or infrastructure are required
