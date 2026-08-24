import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

// The logger re-reads process.env on every call, so we mutate/restore it
// around each test rather than mocking the module.
const SECRET_ENV_KEY = "TEST_FAKE_SECRET_TOKEN";
const SECRET_VALUE = "sk_live_super_secret_value_12345";

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env[SECRET_ENV_KEY];
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function lastLine(spy: ReturnType<typeof vi.spyOn>) {
    const call = spy.mock.calls.at(-1);
    if (!call) throw new Error("logger was not called");
    return JSON.parse(call[0] as string);
  }

  it("emits structured JSON with level, message, and timestamp", () => {
    logger.info("hello world", { correlationId: "req-1" });
    const line = lastLine(logSpy);
    expect(line.level).toBe("info");
    expect(line.message).toBe("hello world");
    expect(line.correlationId).toBe("req-1");
    expect(typeof line.timestamp).toBe("string");
    expect(new Date(line.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("routes warn/error to console.warn/console.error respectively", () => {
    logger.warn("careful");
    logger.error("boom");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("redacts a context key whose name looks secret-shaped, regardless of value", () => {
    logger.info("user login", { password: "hunter2", apiKey: "abc", userId: 42 });
    const line = lastLine(logSpy);
    expect(line.password).toBe("[redacted]");
    expect(line.apiKey).toBe("[redacted]");
    expect(line.userId).toBe(42);
  });

  it("scrubs the literal value of a currently-set secret env var when it appears in the message", () => {
    process.env[SECRET_ENV_KEY] = SECRET_VALUE;
    logger.info(`Calling upstream with token ${SECRET_VALUE} attached`);
    const line = lastLine(logSpy);
    expect(line.message).not.toContain(SECRET_VALUE);
    expect(line.message).toContain("[redacted]");
  });

  it("scrubs a secret env value even when it appears under an innocuous-looking context key", () => {
    process.env[SECRET_ENV_KEY] = SECRET_VALUE;
    logger.info("debug dump", { note: `raw value was ${SECRET_VALUE}` });
    const line = lastLine(logSpy);
    expect(JSON.stringify(line)).not.toContain(SECRET_VALUE);
    expect(line.note).toContain("[redacted]");
  });

  it("scrubs a secret env value nested inside an object", () => {
    process.env[SECRET_ENV_KEY] = SECRET_VALUE;
    logger.info("nested dump", {
      payload: { inner: { deep: `leaked=${SECRET_VALUE}` } },
    });
    const line = lastLine(logSpy);
    expect(JSON.stringify(line)).not.toContain(SECRET_VALUE);
    expect(line.payload.inner.deep).toContain("[redacted]");
  });

  it("scrubs a secret env value that appears in an Error message and stack", () => {
    process.env[SECRET_ENV_KEY] = SECRET_VALUE;
    const err = new Error(`upstream call failed with token ${SECRET_VALUE}`);
    logger.error("upstream failure", { error: err });
    const line = lastLine(errorSpy);
    const serialized = JSON.stringify(line);
    expect(serialized).not.toContain(SECRET_VALUE);
    expect(line.error.message).toContain("[redacted]");
    // stack traces include the message by default in V8, so it should be
    // scrubbed there too rather than leaking via `error.stack`.
    if (line.error.stack) {
      expect(line.error.stack).not.toContain(SECRET_VALUE);
    }
  });

  it("does not redact values that merely resemble but do not equal a live secret", () => {
    process.env[SECRET_ENV_KEY] = SECRET_VALUE;
    logger.info("unrelated message with similar-looking text sk_live_super_secret");
    const line = lastLine(logSpy);
    // Partial prefix match should NOT trigger scrubbing (only exact value match does).
    expect(line.message).toContain("sk_live_super_secret");
  });
});
