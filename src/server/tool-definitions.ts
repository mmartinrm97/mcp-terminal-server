export const TOOL_DEFINITIONS = [
  {
    name: "terminal_create_session",
    description:
      "Create a new interactive terminal session. Auto-detects shell by platform. " +
      "Returns session info including ID for subsequent calls.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Optional custom session ID. Auto-generated if omitted.",
        },
        label: {
          type: "string",
          description:
            'Human-readable label (e.g. "backend-dev", "frontend"). Makes multi-agent flows clearer.',
        },
        shell: {
          type: "string",
          enum: ["auto", "bash", "zsh", "pwsh", "cmd"],
          description: 'Shell to use. "auto" detects based on platform.',
        },
        cwd: { type: "string", description: "Working directory. Defaults to process.cwd()." },
        cols: { type: "number", description: "Terminal columns. Default: 80." },
        rows: { type: "number", description: "Terminal rows. Default: 24." },
        env: {
          type: "object",
          description: "Additional environment variables.",
          additionalProperties: { type: "string" },
        },
        verbose: {
          type: "boolean",
          description:
            "If true, include timestamps and output counters in the response. Default: false for smaller payloads.",
        },
      },
    },
  },
  {
    name: "terminal_write",
    description: String.raw`Write text/keystrokes to the terminal session. Supports control sequences: \n (Enter), \x03 (Ctrl+C/SIGINT), \x1b (Escape), \t (Tab).`,
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID returned by terminal_create_session." },
        data: { type: "string", description: String.raw`Text data to write. Use \n for Enter.` },
      },
      required: ["id", "data"],
    },
  },
  {
    name: "terminal_read",
    description:
      "Read the current terminal buffer contents. Non-blocking — returns whatever output " +
      "has accumulated. Use flush=true to clear the buffer after reading. " +
      "Use since=<byte_position> to read from a specific byte offset (incremental reads).",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        flush: {
          type: "boolean",
          description: "If true, clears the buffer after reading. Default: false.",
        },
        since: {
          type: "number",
          description:
            "Byte position to read from (global counter). Returns data from that position " +
            "plus the current total position. Use with position from previous response for " +
            "incremental reads. Does NOT clear the buffer.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "terminal_read_until",
    description:
      "Read the terminal buffer until a regex pattern matches or timeout is reached. " +
      "THE KEY TOOL for interactive flows — wait for a prompt or question before responding.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        pattern: {
          type: "string",
          description: 'Regex pattern to wait for (e.g. "package name:").',
        },
        timeout_ms: {
          type: "number",
          description: "Max wait time in milliseconds. Default: 30000.",
        },
        strip_ansi: {
          type: "boolean",
          description: "If true, strip ANSI escape codes from output. Default: false.",
        },
        include_full_output: {
          type: "boolean",
          description:
            "If true, include the full matched buffer snapshot. Default: false to avoid token-heavy responses.",
        },
        include_debug: {
          type: "boolean",
          description:
            "If true, include diagnostic prompt/idle metadata. Default: false; prefer diagnostics/export tools for deep debugging.",
        },
      },
      required: ["id", "pattern"],
    },
  },
  {
    name: "terminal_resize",
    description: "Resize the terminal dimensions for a session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        cols: { type: "number", description: "New column count." },
        rows: { type: "number", description: "New row count." },
      },
      required: ["id", "cols", "rows"],
    },
  },
  {
    name: "terminal_tail",
    description:
      "Read the last N lines of the terminal buffer (like `tail -n N`). " +
      "Token-efficient: returns only recent output, not the full accumulated history. " +
      "Use this INSTEAD of terminal_read for long-running processes (dev servers, logs, etc.) " +
      "to avoid paying tokens for old output.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        lines: {
          type: "number",
          description: "Number of recent lines to return (default: 20).",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "terminal_send_signal",
    description:
      "Send a signal to the foreground process in the terminal. Use this INSTEAD of " +
      "terminal_write with control characters for SIGINT/Ctrl+C, SIGTSTP/Ctrl+Z, etc. " +
      "More explicit and reliable than writing raw bytes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        signal: {
          type: "string",
          enum: ["SIGINT", "SIGTSTP", "SIGQUIT", "SIGKILL"],
          description: "Signal to send. SIGINT=Ctrl+C, SIGTSTP=Ctrl+Z, SIGQUIT=Ctrl+\\",
        },
      },
      required: ["id", "signal"],
    },
  },
  {
    name: "terminal_ping",
    description:
      "Health check for the terminal server. Returns server status, active session count, " +
      "and uptime. Use this to verify the server is alive before starting work.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "terminal_screenshot",
    description:
      "Take a screenshot of the current terminal screen. Returns clean, rendered text rows " +
      "without raw ANSI codes. The HIGH-LEVEL alternative to terminal_read " +
      "for understanding TUI state (menus, prompts, selections). " +
      "Also includes semantic fields such as detectedPrompt, isInteractive, " +
      "recommendedNextAction, terminal_mode, and editor_mode.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        verbosity: {
          type: "string",
          enum: ["minimal", "standard", "diagnostic"],
          description:
            "Response size preset. minimal returns only core prompt/navigation fields; standard adds prompt guidance; diagnostic adds rows, geometry, and metrics.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "terminal_list_sessions",
    description:
      "List all active terminal sessions. Use verbose=true to include last activity timestamps.",
    inputSchema: {
      type: "object" as const,
      properties: {
        verbose: {
          type: "boolean",
          description: "If true, includes last activity timestamps. Default: false.",
        },
      },
    },
  },
  {
    name: "terminal_session_diagnostics",
    description:
      "Return structured diagnostics for a session: session metadata, recent event timeline, " +
      "and a fresh semantic screenshot. Use this to debug interactive failures and reconstruct " +
      "what the agent likely saw and did.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        event_limit: {
          type: "number",
          description: "Maximum number of recent events to include (default: 50).",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "terminal_session_export",
    description:
      "Return a structured export for one session: metadata, recent events, last screenshot, " +
      "and a replay-friendly transcript for issue reports and bug reproduction.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        event_limit: {
          type: "number",
          description: "Maximum number of recent events/transcript items to include (default: 50).",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "terminal_close_session",
    description:
      "Close a terminal session and free its resources. Use force=true for immediate SIGKILL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Session ID." },
        force: {
          type: "boolean",
          description: "If true, sends SIGKILL immediately. Default: false (graceful SIGHUP).",
        },
      },
      required: ["id"],
    },
  },
];
