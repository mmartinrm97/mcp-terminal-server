# terminalize Installation Guides

These guides document host-specific installation for `terminalize`.

The goal is simple:

- show the exact config shape each client expects
- keep client-specific caveats out of the main README
- make installs easier to verify and maintain over time

## Available Guides

- [Antigravity CLI (AGY)](./install-antigravity.md)
- [Claude Code](./install-claude.md)
- [OpenAI Codex](./install-codex.md)

## Notes

- Antigravity is plugin-first because it can bundle MCP config and skills together.
- Claude Code and Codex use direct MCP server configuration.
- If a guide is missing for your client, use the main [README](../../README.md) as the fallback reference.
