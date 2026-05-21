# terminalize Benchmarks

These numbers are **serialized JSON payload size benchmarks**, not provider billing estimates.

They answer a narrower and more useful question:

> how much payload did we remove from the default MCP responses that agents consume on every round-trip?

## Run locally

```bash
pnpm bench:payload
```

## Current baseline

```text
terminalize payload benchmark (serialized JSON bytes)
Tool                    Scenario                                 Before  After  Saved  %
----------------------  ---------------------------------------  ------  -----  -----  -----
terminal_read_until     legacy default -> compact default        691 B   412 B  279 B  40.4%
terminal_screenshot     legacy verbose -> minimal default        986 B   335 B  651 B  66%
terminal_list_sessions  verbose session list -> compact default  1474 B  659 B  815 B  55.3%
```

## Methodology

- Uses fixed representative fixtures for the old default shapes and the current compact default shapes.
- Measures `Buffer.byteLength(JSON.stringify(payload), "utf8")`.
- Focuses on default agent-facing responses, because those are the hot path that drives token spend.
- Does **not** try to estimate model-specific token billing, because that varies by vendor and tokenizer.

## What this benchmark proves

- `terminal_read_until` is materially cheaper by default after making `full_output` and diagnostic details opt-in.
- `terminal_screenshot` is much cheaper in minimal mode than the old always-verbose shape.
- `terminal_list_sessions` scales better after compacting `SessionInfo` by default.

## What it does not prove

- End-to-end provider cost in dollars.
- Real network latency under every client.
- The value of future round-trip optimizations like a composite `terminal_execute` tool.

For those, you need separate integration benchmarks.
