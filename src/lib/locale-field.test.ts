import { describe, expect, it } from "vitest";
import { localeField, LOCALE_FIELD_BASES } from "@/lib/locale-field";

describe("localeField", () => {
  it("maps base + 'en' locale to the En column", () => {
    expect(localeField("en", "name")).toBe("nameEn");
    expect(localeField("en", "description")).toBe("descriptionEn");
  });

  it("maps base + 'so' locale to the So column", () => {
    expect(localeField("so", "name")).toBe("nameSo");
    expect(localeField("so", "description")).toBe("descriptionSo");
  });

  it("covers every bilingual field pair in the schema", () => {
    for (const base of LOCALE_FIELD_BASES) {
      expect(localeField("en", base)).toBe(`${base}En`);
      expect(localeField("so", base)).toBe(`${base}So`);
    }
  });

  it("falls back to 'en' for an unsupported locale", () => {
    expect(localeField("fr", "name")).toBe("nameEn");
    expect(localeField("de", "name")).toBe("nameEn");
  });

  it("falls back to 'en' for null/undefined/empty locale", () => {
    expect(localeField(null, "name")).toBe("nameEn");
    expect(localeField(undefined, "name")).toBe("nameEn");
    expect(localeField("", "name")).toBe("nameEn");
  });
});
