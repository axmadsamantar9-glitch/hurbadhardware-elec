import { describe, it, expect, beforeEach } from "vitest";
import { useCompareStore } from "./compareStore";

describe("useCompareStore", () => {
  beforeEach(() => {
    useCompareStore.getState().clear();
  });

  it("starts empty", () => {
    expect(useCompareStore.getState().ids).toEqual([]);
    expect(useCompareStore.getState().has("p1")).toBe(false);
  });

  it("toggle() adds a product not yet selected and returns 'added'", () => {
    const status = useCompareStore.getState().toggle("p1");
    expect(status).toBe("added");
    expect(useCompareStore.getState().has("p1")).toBe(true);
  });

  it("toggle() removes an already-selected product and returns 'removed'", () => {
    useCompareStore.getState().toggle("p1");
    const status = useCompareStore.getState().toggle("p1");
    expect(status).toBe("removed");
    expect(useCompareStore.getState().has("p1")).toBe(false);
  });

  it("rejects a 4th distinct selection at the cap, leaving the existing 3 untouched", () => {
    useCompareStore.getState().toggle("p1");
    useCompareStore.getState().toggle("p2");
    useCompareStore.getState().toggle("p3");

    const status = useCompareStore.getState().toggle("p4");
    expect(status).toBe("rejected_full");
    expect(useCompareStore.getState().ids).toEqual(["p1", "p2", "p3"]);
    expect(useCompareStore.getState().has("p4")).toBe(false);
  });

  it("remove() removes a single product without clearing the rest", () => {
    useCompareStore.getState().toggle("p1");
    useCompareStore.getState().toggle("p2");
    useCompareStore.getState().remove("p1");

    const state = useCompareStore.getState();
    expect(state.has("p1")).toBe(false);
    expect(state.has("p2")).toBe(true);
  });

  it("remove() is idempotent for a product not present", () => {
    expect(() => useCompareStore.getState().remove("not-there")).not.toThrow();
    expect(useCompareStore.getState().ids).toEqual([]);
  });

  it("clear() empties the whole set", () => {
    useCompareStore.getState().toggle("p1");
    useCompareStore.getState().toggle("p2");
    useCompareStore.getState().clear();

    expect(useCompareStore.getState().ids).toEqual([]);
  });
});
