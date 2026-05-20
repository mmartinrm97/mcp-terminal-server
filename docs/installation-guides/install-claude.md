# Install terminalize in Claude Code

## Prerequisites

1. Claude Code installed
2. Node.js 22+
3. `npx` available in your shell

## Configuration File

Edit:

```text
~/.claude/settings.json
```

Add:

```json
{
  "mcpServers": {
    "terminalize": {
      "command": "npx",
      "args": ["terminalize"]
    }
  }
}
```

## Skill Install

To install the `terminalize` skill for Claude Code:

```bash
npx terminalize install-skills
```

Choose **Global** or **Project**, then select **Claude Code**.

## Verification

After restarting Claude Code:

1. run `claude mcp list`
2. confirm `terminalize` is connected
3. ask Claude to validate a real interactive flow, for example:

```text
Verify terminalize is configured, then run npm init interactively without batching Enter presses.
```
