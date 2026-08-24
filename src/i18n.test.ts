import { describe, it, expect } from "vitest";
import { locales, defaultLocale, type Locale } from "@/i18n";

describe("i18n Configuration", () => {
  describe("Locale Validation", () => {
    it("should include en in supported locales", () => {
      expect(locales).toContain("en");
    });

    it("should include so in supported locales", () => {
      expect(locales).toContain("so");
    });

    it("should have exactly 2 supported locales", () => {
      expect(locales.length).toBe(2);
    });

    it("should have en as default locale", () => {
      expect(defaultLocale).toBe("en");
    });

    it('should validate locale "en" against whitelist', () => {
      const testLocale: Locale = "en";
      expect(locales.includes(testLocale)).toBe(true);
    });

    it('should validate locale "so" against whitelist', () => {
      const testLocale: Locale = "so";
      expect(locales.includes(testLocale)).toBe(true);
    });

    it('should reject invalid locale "fr"', () => {
      const testLocale = "fr";
      expect(locales.includes(testLocale as Locale)).toBe(false);
    });

    it('should reject invalid locale "es"', () => {
      const testLocale = "es";
      expect(locales.includes(testLocale as Locale)).toBe(false);
    });

    it('should reject invalid locale "de"', () => {
      const testLocale = "de";
      expect(locales.includes(testLocale as Locale)).toBe(false);
    });

    it("should reject empty string as locale", () => {
      const testLocale = "";
      expect(locales.includes(testLocale as Locale)).toBe(false);
    });

    it("should reject null/undefined values in locale check", () => {
      expect(locales.includes(null as unknown as Locale)).toBe(false);
      expect(locales.includes(undefined as unknown as Locale)).toBe(false);
    });

    it("should fallback to defaultLocale if locale is invalid", () => {
      const invalidLocale = "fr";
      const resolvedLocale = locales.includes(invalidLocale as Locale)
        ? invalidLocale
        : defaultLocale;
      expect(resolvedLocale).toBe("en");
    });

    it("should return provided locale if valid", () => {
      const validLocale = "so";
      const resolvedLocale = locales.includes(validLocale as Locale) ? validLocale : defaultLocale;
      expect(resolvedLocale).toBe("so");
    });

    it("should handle mixed case invalid locales", () => {
      const testLocale = "EN";
      expect(locales.includes(testLocale as Locale)).toBe(false);
    });

    it("should handle whitespace in locale strings", () => {
      const testLocale = " en ";
      expect(locales.includes(testLocale as Locale)).toBe(false);
    });
  });
});
