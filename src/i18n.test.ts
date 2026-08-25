import { describe, it, expect } from "vitest";
import { createTranslator } from "use-intl/core";
import { locales, defaultLocale, mergeMessagesWithFallback, type Locale } from "@/i18n";

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

describe("Missing translation key falls back to English (AC5)", () => {
  // This is distinct from the locale-CODE fallback tested above (an invalid
  // locale like "fr" resolving to "en"). This tests key-level fallback: a
  // key that exists in en.json but is (temporarily/hypothetically) absent
  // from so.json should still resolve to readable English text when read
  // under the "so" locale, rather than next-intl's default MISSING_MESSAGE
  // behavior (which renders the dotted key path).
  //
  // next-intl/use-intl's core translator has no built-in cross-locale
  // fallback — a message missing from the active locale's tree throws
  // MISSING_MESSAGE and falls back to the key path, not another locale's
  // text (verified against node_modules/use-intl's IntlErrorCode). So this
  // repo's src/i18n.ts deep-merges `so` on top of `en` before handing
  // messages to next-intl (see `mergeMessagesWithFallback`), which is what
  // makes English fallback happen in production. Both the real merge
  // function AND the real `use-intl` translator are exercised here — no
  // hand-rolled simulation of either.
  it("mergeMessagesWithFallback keeps the English value for a key absent from the override", () => {
    const en = { checkout: { title: "Checkout", placeOrder: "Place Order" } };
    // Simulates so.json temporarily missing `checkout.placeOrder`.
    const soWithGap = { checkout: { title: "Bixinta" } };

    const merged = mergeMessagesWithFallback(en, soWithGap);

    expect(merged).toEqual({
      checkout: { title: "Bixinta", placeOrder: "Place Order" },
    });
  });

  it("a real use-intl translator built from the merged messages resolves the gapped key to English text", () => {
    const en = { checkout: { title: "Checkout", placeOrder: "Place Order" } };
    const soWithGap = { checkout: { title: "Bixinta" } };
    // mergeMessagesWithFallback's return type is intentionally the generic
    // `MessageTree` recursive shape (it operates on arbitrary message trees
    // at runtime); this cast just restores the literal key type for
    // createTranslator's compile-time key checking, matching the object
    // actually produced above.
    const merged = mergeMessagesWithFallback(en, soWithGap) as typeof en;

    const t = createTranslator({ locale: "so", messages: merged });

    // Present in so → so text.
    expect(t("checkout.title")).toBe("Bixinta");
    // Missing from so → falls back to the English text via the merge, not
    // the next-intl default of rendering "checkout.placeOrder".
    expect(t("checkout.placeOrder")).toBe("Place Order");
  });

  it("does not let English override a key that IS present in the target locale", () => {
    const en = { checkout: { title: "Checkout" } };
    const so = { checkout: { title: "Bixinta" } };

    const merged = mergeMessagesWithFallback(en, so) as typeof en;

    expect(merged.checkout.title).toBe("Bixinta");
  });
});

/**
 * AC6 — the no-reload EN→SO language switch test remains untestable without
 * jsdom/@testing-library/react (real DOM re-render + click simulation), and
 * this task does not add that dependency. This is already documented as a
 * known limitation in
 * src/components/__tests__/language-switcher.test.ts (see the comment above
 * the "closeMenu logic" describe block, citing the HUB-20 learning). Nothing
 * further to do here beyond this confirmation — the gap is deferred, not
 * dropped.
 */
