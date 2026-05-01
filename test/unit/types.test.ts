import { describe, it, expect } from "vitest";
import { SessionNotFoundError, SessionLimitError, ReadTimeoutError } from "../../src/types.js";

describe("SessionNotFoundError", () => {
  it("should set name and message correctly", () => {
    const err = new SessionNotFoundError("test-session-id");
    expect(err.name).toBe("SessionNotFoundError");
    expect(err.message).toBe("Session not found: test-session-id");
  });

  it("should be an instance of Error", () => {
    const err = new SessionNotFoundError("abc");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SessionNotFoundError);
  });
});

describe("SessionLimitError", () => {
  it("should set name and report max in message", () => {
    const err = new SessionLimitError(10);
    expect(err.name).toBe("SessionLimitError");
    expect(err.message).toBe("Maximum session limit reached (10)");
  });

  it("should report different max values", () => {
    const err = new SessionLimitError(5);
    expect(err.message).toBe("Maximum session limit reached (5)");
  });

  it("should be an instance of Error", () => {
    const err = new SessionLimitError(3);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SessionLimitError);
  });
});

describe("ReadTimeoutError", () => {
  it("should set name, timedOut, and partialData", () => {
    const err = new ReadTimeoutError("timeout", "partial output");
    expect(err.name).toBe("ReadTimeoutError");
    expect(err.message).toBe("timeout");
    expect(err.timedOut).toBe(true);
    expect(err.partialData).toBe("partial output");
  });

  it("should have empty partialData by default", () => {
    const err = new ReadTimeoutError("timed out");
    expect(err.partialData).toBe("");
  });

  it("should be an instance of Error", () => {
    const err = new ReadTimeoutError("msg");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ReadTimeoutError);
  });
});
