# Install terminalize in GitHub Copilot CLI

## Prerequisites

1. GitHub Copilot CLI installed
2. Node.js 22+
3. `npx` available in your shell

## MCP Configuration

GitHub Copilot CLI uses its own MCP config format.

Project:

```text
.mcp.json
```

Global:

```text
~/.copilot/mcp-config.json
```

Add:

```json
{
  "mcpServers": {
    "terminalize": {
      "type": "local",
      "command": "npx",
      "args": ["terminalize"],
      "tools": ["*"]
    }
  }
}
```

If you already have a VS Code MCP config in `.vscode/mcp.json`, GitHub recommends migrating it to `.mcp.json` for Copilot CLI instead of reusing the VS Code file directly.

## Skill Install

To install the `terminalize` skill for GitHub Copilot CLI:

```bash
npx terminalize install-skills
```

Choose:

- **Project** → `.agents/skills/terminalize`
- **Global** → `~/.copilot/skills/terminalize`

## Verification

After restarting Copilot CLI:

1. run `/mcp show`
2. confirm `terminalize` is listed
3. run `/skills info terminalize`
4. ask Copilot to use `terminalize` for a real interactive flow

Example:

```text
Use /terminalize and run npm init interactively without batching Enter presses.
```

## References

- [Adding MCP servers for GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
- [CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)
- [Adding agent skills for GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills)
