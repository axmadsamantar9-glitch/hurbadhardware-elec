import { describe, it, expect } from "vitest";
import { sortProductImages } from "./images";

describe("sortProductImages", () => {
  it("puts the primary image first regardless of position", () => {
    const images = [
      { id: "1", isPrimary: false, position: 0 },
      { id: "2", isPrimary: true, position: 2 },
      { id: "3", isPrimary: false, position: 1 },
    ];
    expect(sortProductImages(images).map((i) => i.id)).toEqual(["2", "1", "3"]);
  });

  it("falls back to position order when no image is primary", () => {
    const images = [
      { id: "a", isPrimary: false, position: 2 },
      { id: "b", isPrimary: false, position: 0 },
      { id: "c", isPrimary: false, position: 1 },
    ];
    expect(sortProductImages(images).map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const images = [
      { id: "a", isPrimary: false, position: 1 },
      { id: "b", isPrimary: true, position: 0 },
    ];
    const original = [...images];
    sortProductImages(images);
    expect(images).toEqual(original);
  });
});
