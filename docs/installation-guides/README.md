# terminalize Installation Guides

These guides document host-specific installation for `terminalize`.

The goal is simple:

- show the exact config shape each client expects
- keep client-specific caveats out of the main README
- make installs easier to verify and maintain over time

## Available Guides

- [Antigravity CLI (AGY)](./install-antigravity.md)
- [Claude Code](./install-claude.md)
- [Cursor](./install-cursor.md)
- [GitHub Copilot CLI](./install-copilot.md)
- [Kiro CLI](./install-kiro.md)
- [OpenAI Codex](./install-codex.md)
- [OpenCode](./install-opencode.md)

## Notes

- Antigravity is plugin-first because it can bundle MCP config and skills together.
- Cursor, Kiro, and Claude Code use direct MCP server configuration.
- GitHub Copilot CLI uses `.mcp.json` in the repo or `~/.copilot/mcp-config.json` globally.
- OpenCode uses `opencode.json` plus its built-in `opencode mcp` commands.
- If a guide is missing for your client, use the main [README](../../README.md) as the fallback reference.
