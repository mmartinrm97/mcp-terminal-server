# terminalize Public API Contract

terminalize exposes a **stable public MCP contract**. This document defines which
tools agents should build against, which tools are supported but considered
operator-focused, and how compatibility is handled across releases.

## Stability policy

- All tools listed here are **stable** as of `v0.5.x`.
- Stable tools may gain optional fields, richer diagnostics, or clearer
  descriptions in minor releases.
- Stable tools will not be removed or renamed in a minor release.
- Any breaking rename, removal, or argument-shape change must ship in a major
  release and be called out explicitly in the changelog.

## Support tiers

### Core tools

These are the long-term integration surface for agents and MCP clients.

1. `terminal_create_session`
2. `terminal_write`
3. `terminal_execute`
4. `terminal_read`
5. `terminal_read_until`
6. `terminal_resize`
7. `terminal_tail`
8. `terminal_send_signal`
9. `terminal_screenshot`
10. `terminal_list_sessions`
11. `terminal_close_session`

### Advanced tools

These are stable and supported, but are primarily aimed at diagnostics,
observability, and operator workflows.

1. `terminal_ping`
2. `terminal_session_diagnostics`
3. `terminal_session_export`

## Recommended integration path

For new agent integrations, prefer this path:

1. `terminal_create_session`
2. `terminal_execute`
3. `terminal_read` or `terminal_tail`
4. `terminal_read_until`
5. `terminal_screenshot` for TUI or timeout recovery
6. `terminal_close_session`

Only opt into diagnostics/export tools when you are debugging a failure,
capturing a bug report, or building operator tooling.

## Compatibility rules

- Adding optional response fields is allowed.
- Adding new tools is allowed.
- Adding optional input fields is allowed.
- Removing tools, renaming tools, or changing required arguments is a breaking
  change and requires a major version.

## Resources

The MCP resources exposed under `terminal://...` are supported, but the primary
compatibility promise is centered on the **tool contract** above because that is
what most agent clients integrate with first.
