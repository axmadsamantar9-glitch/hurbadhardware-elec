import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call the function before the delay elapses", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced.call("a");
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
  });

  it("calls the function once the delay elapses", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced.call("a");
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("resets the timer on a subsequent call within the delay window (trailing-edge only)", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced.call("a");
    vi.advanceTimersByTime(200);
    debounced.call("b");
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("cancel() prevents a pending call from firing", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced.call("a");
    debounced.cancel();
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel() with no pending call is a no-op", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    expect(() => debounced.cancel()).not.toThrow();
  });

  it("supports multiple independent scheduled calls over time", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced.call(1);
    vi.advanceTimersByTime(300);
    debounced.call(2);
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenNthCalledWith(1, 1);
    expect(fn).toHaveBeenNthCalledWith(2, 2);
  });
});
