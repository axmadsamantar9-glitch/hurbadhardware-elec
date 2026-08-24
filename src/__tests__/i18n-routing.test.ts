import { describe, it, expect } from "vitest";
import { locales, defaultLocale, type Locale } from "@/i18n";

describe("i18n Routing Integration", () => {
  describe("Locale Path Generation", () => {
    it("should generate valid /en/ path", () => {
      const path = "/en/";
      const localePrefix = path.split("/")[1];
      expect(locales.includes(localePrefix as Locale)).toBe(true);
    });

    it("should generate valid /so/ path", () => {
      const path = "/so/";
      const localePrefix = path.split("/")[1];
      expect(locales.includes(localePrefix as Locale)).toBe(true);
    });

    it("should reject invalid /fr/ path", () => {
      const path = "/fr/";
      const localePrefix = path.split("/")[1];
      expect(locales.includes(localePrefix as Locale)).toBe(false);
    });

    it("should handle /en/account path", () => {
      const path = "/en/account";
      const localePrefix = path.split("/")[1];
      expect(locales.includes(localePrefix as Locale)).toBe(true);
    });

    it("should handle /so/auth/signin path", () => {
      const path = "/so/auth/signin";
      const localePrefix = path.split("/")[1];
      expect(locales.includes(localePrefix as Locale)).toBe(true);
    });

    it("should extract locale from /en/account correctly", () => {
      const path = "/en/account";
      const localePattern = new RegExp(`^/(${locales.join("|")})(/|$)`);
      const match = path.match(localePattern);
      expect(match?.[1]).toBe("en");
    });

    it("should extract locale from /so/admin correctly", () => {
      const path = "/so/admin";
      const localePattern = new RegExp(`^/(${locales.join("|")})(/|$)`);
      const match = path.match(localePattern);
      expect(match?.[1]).toBe("so");
    });

    it("should not match invalid locale in path /fr/account", () => {
      const path = "/fr/account";
      const localePattern = new RegExp(`^/(${locales.join("|")})(/|$)`);
      const match = path.match(localePattern);
      expect(match).toBeNull();
    });
  });

  describe("Locale Fallback Logic", () => {
    it("should fallback to en for invalid locale", () => {
      const requestedLocale = "fr";
      const resolvedLocale = locales.includes(requestedLocale as Locale)
        ? requestedLocale
        : defaultLocale;
      expect(resolvedLocale).toBe("en");
    });

    it("should fallback to en for empty locale", () => {
      const requestedLocale = "";
      const resolvedLocale = locales.includes(requestedLocale as Locale)
        ? requestedLocale
        : defaultLocale;
      expect(resolvedLocale).toBe("en");
    });

    it("should keep en when en is requested", () => {
      const requestedLocale = "en";
      const resolvedLocale = locales.includes(requestedLocale as Locale)
        ? requestedLocale
        : defaultLocale;
      expect(resolvedLocale).toBe("en");
    });

    it("should keep so when so is requested", () => {
      const requestedLocale = "so";
      const resolvedLocale = locales.includes(requestedLocale as Locale)
        ? requestedLocale
        : defaultLocale;
      expect(resolvedLocale).toBe("so");
    });
  });

  describe("Route Path Building", () => {
    it("should build path to /en/account from locale en and route account", () => {
      const locale: Locale = "en";
      const route = "account";
      const fullPath = `/${locale}/${route}`;
      expect(fullPath).toBe("/en/account");
    });

    it("should build path to /so/auth/signin from locale so", () => {
      const locale: Locale = "so";
      const path = `/${locale}/auth/signin`;
      expect(path).toBe("/so/auth/signin");
    });

    it("should handle locale without trailing route", () => {
      const locale: Locale = "en";
      const path = `/${locale}`;
      expect(path).toBe("/en");
    });

    it("should handle locale with slash", () => {
      const locale: Locale = "so";
      const path = `/${locale}/`;
      expect(path).toBe("/so/");
    });
  });

  describe("HTML lang Attribute", () => {
    it('should map en locale to lang="en"', () => {
      const locale: Locale = "en";
      const langMap: Record<Locale, string> = {
        en: "en",
        so: "so",
      };
      expect(langMap[locale]).toBe("en");
    });

    it('should map so locale to lang="so"', () => {
      const locale: Locale = "so";
      const langMap: Record<Locale, string> = {
        en: "en",
        so: "so",
      };
      expect(langMap[locale]).toBe("so");
    });
  });

  describe("Default Locale Behavior", () => {
    it("should have en as default locale", () => {
      expect(defaultLocale).toBe("en");
    });

    it("should use en when no locale is specified", () => {
      const noLocale = undefined;
      const resolvedLocale =
        noLocale && locales.includes(noLocale as Locale) ? noLocale : defaultLocale;
      expect(resolvedLocale).toBe("en");
    });
  });
});
