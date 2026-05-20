# Install terminalize in OpenCode

## Prerequisites

1. OpenCode installed
2. Node.js 22+
3. `npx` available in your shell

## MCP Configuration

OpenCode supports global and project config.

Global:

```text
~/.config/opencode/opencode.json
```

Project:

```text
opencode.json
```

Add:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "terminalize": {
      "type": "local",
      "command": ["npx", "terminalize"],
      "enabled": true
    }
  }
}
```

## Skill Install

To install the `terminalize` skill for OpenCode:

```bash
npx terminalize install-skills
```

Choose:

- **Project** → `.agents/skills/terminalize`
- **Global** → `~/.config/opencode/skills/terminalize`

## Verification

After restarting OpenCode:

1. run `opencode mcp list`
2. confirm `terminalize` is available
3. ask OpenCode to use `terminalize` for a real interactive command

Example:

```text
Use the terminalize skill and verify npm init interactively, waiting for each prompt before writing.
```

## References

- [OpenCode config docs](https://dev.opencode.ai/docs/config/)
- [OpenCode MCP docs](https://opencode.ai/docs/mcp-servers)
- [OpenCode agent skills docs](https://opencode.ai/docs/skills)
