# terminalize Benchmarks

These benchmarks cover three different questions:

1. **Payload size** — how big are the default MCP responses?
2. **Round-trips** — how many MCP calls does a workflow need?
3. **Approximate provider cost** — what do those payload changes mean under a pricing snapshot?
4. **Sustained-session retention** — how much output remains resident after long-running output streams?

## Run locally

```bash
pnpm bench:payload
pnpm bench:workflow
pnpm bench:latency
pnpm bench:cost
pnpm profile:buffer
```

## Payload baseline

```text
terminalize payload benchmark (serialized JSON bytes)
Tool                    Scenario                                 Before  After  Saved  %
----------------------  ---------------------------------------  ------  -----  -----  -----
terminal_read_until     legacy default -> compact default        691 B   412 B  279 B  40.4%
terminal_screenshot     legacy verbose -> minimal default        986 B   335 B  651 B  66%
terminal_list_sessions  verbose session list -> compact default  1474 B  659 B  815 B  55.3%
```

## Workflow round-trip baseline

```text
terminalize workflow benchmark (MCP round-trips)
Scenario               Before  After  Saved  %
---------------------  ------  -----  -----  -----
prompt-by-prompt flow  11      7      4      36.4%
single confirmation    5       4      1      20%
```

## Local latency baseline

This benchmark measures local MCP handler overhead for the same logical interaction:

- once as `terminal_write` + `terminal_read_until`
- once as the composite `terminal_execute`

It is intentionally **not** a shell benchmark. It isolates the local protocol/handler path so the numbers stay stable and reproducible.

```bash
pnpm bench:latency
```

## Approximate provider cost baseline

This benchmark uses:

- current official pricing snapshots
- **input token pricing only**, because MCP tool output becomes the next model input
- a rough heuristic of **~4 UTF-8 bytes per token**
- **1,000 tool responses per scenario**

```text
terminalize cost estimate benchmark (approximate model input cost)
Pricing snapshot as of 2026-05-21
```

Run `pnpm bench:cost` locally to see the current table.

## Pricing snapshot sources

- OpenAI API pricing: [openai.com/api/pricing](https://openai.com/api/pricing/)
- Anthropic Claude pricing: [docs.anthropic.com/.../pricing](https://docs.anthropic.com/en/docs/about-claude/pricing)
- Gemini Developer API pricing: [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing?hl=es-419)

## Methodology

### Payload benchmark

- Uses fixed representative fixtures for the old default shapes and the current compact default shapes.
- Measures `Buffer.byteLength(JSON.stringify(payload), "utf8")`.
- Focuses on default agent-facing responses, because those are the hot path that drives token spend.

### Workflow benchmark

- Compares representative interactive flows before and after `terminal_execute`.
- Measures MCP call count, not model latency.
- The goal is to show protocol overhead reduction, not host-specific shell speed.

### Local latency benchmark

- Runs the same logical interaction through the MCP handlers in a tight loop.
- Measures local wall-clock handler overhead for split vs composite tool usage.
- Useful for validating that fewer round-trips help local orchestration latency, not just token cost.

### Cost benchmark

- Converts serialized payload bytes into approximate tokens using a simple heuristic.
- Multiplies by official input-token pricing snapshots from provider docs.
- This is a planning tool, **not** a billing oracle.

### Sustained-session buffer profile

- Simulates a long-running PTY session pushing ~8 MiB of output through `OutputBuffer`.
- Compares the default retention behavior against a consumer that periodically `readAll()` + `compact()`.
- Reports retained bytes, retained percentage, rough RSS delta, and loop duration.

Use it when you want to answer the operational question:

> “If an agent leaves a noisy session alive for a while, how much output are we actually keeping in memory?”

## What these benchmarks prove

- The default MCP payloads are materially smaller than before.
- `terminal_execute` reduces round-trips in the common prompt-by-prompt workflow.
- Under current provider pricing, payload savings are small per call but meaningful at scale.

## What they do not prove

- Exact billable cost for every provider tokenizer.
- End-to-end client latency across all MCP hosts.
- Final user-facing cost once retries, reasoning tokens, and tool selection mistakes are included.

For those, you need separate host-specific integration benchmarks.
