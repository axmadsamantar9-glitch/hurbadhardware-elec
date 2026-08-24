import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn (className joiner)", () => {
  it("joins multiple string args with a space", () => {
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("skips falsy values: undefined, null, false, empty string, 0", () => {
    expect(cn("foo", undefined, "bar", null, false, "", 0, "baz")).toBe("foo bar baz");
  });

  it("stringifies numeric args", () => {
    expect(cn("foo", 42)).toBe("foo 42");
  });

  it("returns an empty string when given no truthy inputs", () => {
    expect(cn()).toBe("");
    expect(cn(undefined, null, false, "")).toBe("");
  });

  it("includes object keys whose value is truthy", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });

  it("excludes object keys whose value is falsy, null, or undefined", () => {
    expect(cn({ a: false, b: null, c: undefined, d: 0 as unknown as boolean })).toBe("");
  });

  it("mixes strings and objects in the same call, preserving order", () => {
    expect(cn("base", { active: true, disabled: false }, "trailing")).toBe("base active trailing");
  });

  it("supports the common conditional-className pattern used by components", () => {
    const error = true;
    expect(
      cn(
        "border",
        error
          ? "border-error focus-visible:ring-error"
          : "border-input-border focus-visible:ring-primary",
        undefined
      )
    ).toBe("border border-error focus-visible:ring-error");
  });

  it("is idempotent for a single plain string (no dedupe/merge, by design)", () => {
    expect(cn("px-4", "px-4")).toBe("px-4 px-4");
  });
});
