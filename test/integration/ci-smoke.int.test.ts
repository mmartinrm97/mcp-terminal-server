// @integration — cross-platform smoke coverage for CI matrix
import { afterEach, describe, expect, it } from "vitest";
import { SessionManager } from "../../src/core/session-manager.js";

const IS_WINDOWS = process.platform === "win32";

function cmd(data: string): string {
  if (IS_WINDOWS && !data.startsWith("@")) {
    return `@${data}`;
  }
  return data;
}

describe("CI smoke matrix", () => {
  const managers: SessionManager[] = [];

  afterEach(() => {
    while (managers.length > 0) {
      const sm = managers.pop();
      if (!sm) continue;
      for (const session of sm.listSessions()) {
        try {
          sm.closeSession(session.id, IS_WINDOWS ? undefined : true);
        } catch {
          // ignore cleanup races during smoke teardown
        }
      }
      sm.dispose();
    }
  });

  it("should create an auto-shell session, execute a command, and read output", async () => {
    const sm = new SessionManager({ max_sessions: 2, session_ttl_ms: 60_000 });
    managers.push(sm);

    const created = await sm.createSession({ shell: "auto", cwd: process.cwd() });
    const session = sm.getSession(created.id);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const marker = `CI_SMOKE_${Date.now()}`;
    session.write(cmd(`echo ${marker}\n`));
    const result = await session.readUntil(marker, 10_000);

    expect(result.timed_out).toBe(false);
    expect(result.matched).toBe(marker);

    const info = session.getInfo();
    expect(info.alive).toBe(true);
    expect(typeof info.shell).toBe("string");
    expect(info.shell.length).toBeGreaterThan(0);
  }, 20_000);

  it("should close a long-running session cleanly", async () => {
    const sm = new SessionManager({ max_sessions: 2, session_ttl_ms: 60_000 });
    managers.push(sm);

    const created = await sm.createSession({ shell: "auto", cwd: process.cwd() });
    const session = sm.getSession(created.id);
    await new Promise((resolve) => setTimeout(resolve, 500));

    session.write(cmd('node -e "setTimeout(function(){},30000)"\n'));
    await new Promise((resolve) => setTimeout(resolve, 300));

    sm.closeSession(created.id, IS_WINDOWS ? undefined : true);
    await new Promise((resolve) => setTimeout(resolve, IS_WINDOWS ? 1000 : 200));

    const sessions = sm.listSessions();
    expect(sessions.some((current) => current.id === created.id)).toBe(false);
  }, 20_000);
});
