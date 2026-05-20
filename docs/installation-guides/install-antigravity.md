# Install terminalize in Antigravity CLI (AGY)

This guide installs `terminalize` for **Antigravity CLI** using the plugin layout documented by Google Antigravity.

It gives AGY both:

- the `terminalize` skill
- the `terminalize` MCP server config

## Why plugin install?

Antigravity plugins can bundle:

- `plugin.json`
- `mcp_config.json`
- `skills/...`

That maps perfectly to what `terminalize` needs.

## Recommended: use `terminalize install-skills`

From your project:

```bash
npx terminalize install-skills
```

Then choose:

- **Project** → installs under `.agents/plugins/terminalize`
- or **Global** → installs under the Antigravity home plugin locations

For Antigravity, the installer writes:

```text
plugin.json
mcp_config.json
skills/terminalize/SKILL.md
```

## Manual project-level install

Create this structure at the root of your project:

```text
.agents/plugins/terminalize/
├── plugin.json
├── mcp_config.json
└── skills/
    └── terminalize/
        └── SKILL.md
```

### `plugin.json`

```json
{
  "name": "terminalize"
}
```

### `mcp_config.json`

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

### `SKILL.md`

Copy from:

```text
skills/terminalize/SKILL.md
```

## Manual global install

Use the shared Gemini config plugin location:

```text
~/.gemini/config/plugins/terminalize/
```

## Verification

After restarting AGY:

1. open `/skills` and confirm `terminalize` appears
2. open `/mcp` and confirm the `terminalize` server is visible
3. ask AGY to run a real interactive flow, for example:

```text
Verify terminalize is configured, then use it to run npm init interactively.
```

## Current validation status

As of May 20, 2026:

- the plugin layout validates successfully with `agy plugin validate`
- AGY can call `terminalize/terminal_ping` successfully when the plugin is installed under `~/.gemini/config/plugins/terminalize`
- AGY still has not completed a full interactive `npm init` flow reliably in our validation runs

So compatibility should still be treated as **partial**: the MCP bridge is alive, but full interactive completion is still under investigation.

## References

- [Antigravity CLI usage docs](https://antigravity.google/docs/cli-using)
- [Antigravity CLI features / plugins](https://antigravity.google/docs/cli-features)
- [Antigravity plugins docs](https://antigravity.google/docs/plugins)
