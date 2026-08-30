import { describe, it, expect } from "vitest";
import { buildSpecSheet } from "./spec-sheet";

function spec(keyEn: string, sortOrder: number) {
  return { keyEn, keySo: keyEn, valueEn: "v", valueSo: "v", sortOrder };
}

describe("buildSpecSheet", () => {
  it("orders specs matching the template first, in template order", () => {
    const specs = [spec("RAM", 2), spec("Screen Size", 0), spec("Battery", 1)];
    const template = [{ keyEn: "Screen Size" }, { keyEn: "Battery" }, { keyEn: "RAM" }];

    expect(buildSpecSheet(specs, template).map((s) => s.keyEn)).toEqual([
      "Screen Size",
      "Battery",
      "RAM",
    ]);
  });

  it("matches template keys case-insensitively", () => {
    const specs = [spec("ram", 0)];
    const template = [{ keyEn: "RAM" }];
    expect(buildSpecSheet(specs, template).map((s) => s.keyEn)).toEqual(["ram"]);
  });

  it("appends specs with no template match after the matched ones", () => {
    const specs = [spec("Custom Spec", 0), spec("RAM", 1)];
    const template = [{ keyEn: "RAM" }];
    expect(buildSpecSheet(specs, template).map((s) => s.keyEn)).toEqual(["RAM", "Custom Spec"]);
  });

  it("returns specs unchanged in original order when the template is empty", () => {
    const specs = [spec("A", 0), spec("B", 1)];
    expect(buildSpecSheet(specs, []).map((s) => s.keyEn)).toEqual(["A", "B"]);
  });
});
