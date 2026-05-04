# Contributing to terminalize

First off, thanks for taking the time to contribute! 🎉

## Code of Conduct

This project follows a standard Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior.

## How to Contribute

### Reporting Bugs

1. **Check existing issues** first to see if the bug has already been reported.
2. **Create a reproduction** — minimal steps or a test case that demonstrates the bug.
3. **Open an issue** with:
   - A clear title and description
   - Steps to reproduce (with code if possible)
   - Expected vs actual behavior
   - Environment info (OS, Node.js version, terminal emulator)

### Suggesting Features

1. **Describe the problem** you're trying to solve — not just the solution you have in mind.
2. **Explain why** it would be useful for the broader community.
3. **Include examples** of how the feature would work.

### Pull Requests

1. **Start from an issue** — open an issue first to discuss the change before writing code.
2. **Fork the repo** and create your branch from `main`.
3. **Follow the code style** — the project uses oxlint and oxfmt:
   ```bash
   pnpm lint        # Check for lint issues
   pnpm fmt         # Format code
   ```
4. **Write tests** — this project uses Strict TDD Mode. Write the test first, then the implementation.
   ```bash
   pnpm test       # Run all tests
   pnpm test:unit  # Unit tests only
   pnpm test:int   # Integration tests only
   ```
5. **Keep PRs focused** — one feature or bugfix per PR. Avoid unrelated changes.
6. **Update documentation** if your change affects the public API (README, design docs).
7. **Ensure CI passes** — all tests must pass, lint must be clean.

### Development Setup

```bash
# Prerequisites: Node.js 22+, pnpm
pnpm install
pnpm build
pnpm test
```

### Project Structure

```
src/
├── types.ts               # Shared types and interfaces
├── index.ts               # Entry point / CLI
├── server.ts              # MCP server with 11 tools
├── core/
│   ├── output-buffer.ts   # Circular buffer with regex matching
│   ├── pty-session.ts     # node-pty wrapper (write, read, screenshot, close)
│   ├── session-manager.ts # Session lifecycle management
│   └── screen.ts          # ANSI screen renderer + terminal mode detection
└── lib/
    ├── utils.ts           # Utility functions (escape sequences, IDs)
    ├── ansi-stripper.ts   # ANSI escape code stripping
    └── shell-detector.ts  # Cross-platform shell detection

test/
├── unit/                  # Unit tests (*.test.ts)
└── integration/           # Integration tests with real PTY sessions
```

### Style Guide

- **Language**: All code, comments, and documentation in English.
- **JSDoc**: All public functions and interfaces must have JSDoc comments.
- **Imports**: Use ES module imports with `.js` extensions (NodeNext module resolution).
- **Types**: Prefer interfaces over type aliases for object shapes.
- **Error handling**: Use custom error classes (see `types.ts`).
- **Async**: Use `async/await` over raw promises.

### Testing Guidelines

- **Unit tests** go in `test/unit/*.test.ts`.
- **Integration tests** go in `test/integration/*.test.ts` with `// @integration` header.
- **Mock external dependencies** (like `node-pty`) in unit tests.
- **Integration tests** use real PTY sessions — handle platform differences (especially Windows).

### Windows-Specific Notes

- `node-pty` on Windows uses ConPTY — async termination requires extra wait time.
- `SIGKILL` is not supported — use `pty.kill()` without signal.
- `node -e` inline scripts may not produce reliable output through ConPTY.

## Questions?

Open a [discussion](https://github.com/mmartinrm97/terminalize/discussions) or ask in the issue tracker.
