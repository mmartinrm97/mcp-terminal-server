export const RESOURCE_DEFINITIONS: Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}> = [
  {
    uri: "terminal://sessions",
    name: "Active Sessions",
    description: "JSON list of all active terminal sessions.",
    mimeType: "application/json",
  },
  {
    uri: "terminal://sessions/{id}/buffer",
    name: "Session Buffer",
    description: "Full buffer contents of a specific terminal session.",
    mimeType: "application/json",
  },
  {
    uri: "terminal://sessions/{id}/status",
    name: "Session Status",
    description: "Status information for a specific terminal session.",
    mimeType: "application/json",
  },
  {
    uri: "terminal://sessions/{id}/events",
    name: "Session Events",
    description: "Recent timeline events for a specific terminal session.",
    mimeType: "application/json",
  },
  {
    uri: "terminal://sessions/{id}/export",
    name: "Session Export",
    description: "Structured diagnostics export for a specific terminal session.",
    mimeType: "application/json",
  },
];
