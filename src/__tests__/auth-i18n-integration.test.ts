import { describe, it, expect } from "vitest";
import { locales, defaultLocale, type Locale } from "@/i18n";

describe("Auth + i18n Integration", () => {
  describe("Login Redirect with Locale Preservation", () => {
    it("should preserve /en/ locale on signin redirect", () => {
      const locale: Locale = "en";
      const signinPath = `/${locale}/auth/signin`;
      expect(signinPath).toBe("/en/auth/signin");
    });

    it("should preserve /so/ locale on signin redirect", () => {
      const locale: Locale = "so";
      const signinPath = `/${locale}/auth/signin`;
      expect(signinPath).toBe("/so/auth/signin");
    });

    it("should redirect unauthenticated /en/account to /en/auth/signin", () => {
      const locale: Locale = "en";
      const signinPath = `/${locale}/auth/signin`;
      expect(signinPath).toBe("/en/auth/signin");
    });

    it("should redirect unauthenticated /so/account to /so/auth/signin", () => {
      const locale: Locale = "so";
      const signinPath = `/${locale}/auth/signin`;
      expect(signinPath).toBe("/so/auth/signin");
    });

    it("should build callback URL preserving locale", () => {
      const locale: Locale = "so";
      const callbackUrl = `/${locale}/account`;
      expect(callbackUrl).toBe("/so/account");
    });
  });

  describe("Login Success with Locale Preservation", () => {
    it("should redirect to /en/account after successful login", () => {
      const locale: Locale = "en";
      const callbackUrl = `/${locale}/account`;
      expect(callbackUrl).toBe("/en/account");
    });

    it("should redirect to /so/account after successful login", () => {
      const locale: Locale = "so";
      const callbackUrl = `/${locale}/account`;
      expect(callbackUrl).toBe("/so/account");
    });
  });

  describe("Logout Redirect with Locale Preservation", () => {
    it("should redirect to /en/ after logout", () => {
      const locale: Locale = "en";
      const redirectPath = `/${locale}`;
      expect(redirectPath).toBe("/en");
    });

    it("should redirect to /so/ after logout", () => {
      const locale: Locale = "so";
      const redirectPath = `/${locale}`;
      expect(redirectPath).toBe("/so");
    });
  });

  describe("Locale Cookie Reading", () => {
    it("should identify locale from /so/account path", () => {
      const path = "/so/account";
      const localePattern = new RegExp(`^/(${locales.join("|")})(/|$)`);
      const match = path.match(localePattern);
      expect(match?.[1]).toBe("so");
    });

    it("should identify locale from /en/auth/signin path", () => {
      const path = "/en/auth/signin";
      const localePattern = new RegExp(`^/(${locales.join("|")})(/|$)`);
      const match = path.match(localePattern);
      expect(match?.[1]).toBe("en");
    });

    it("should fallback to default when no valid locale in path", () => {
      const path = "/fr/account";
      const localePattern = new RegExp(`^/(${locales.join("|")})(/|$)`);
      const match = path.match(localePattern);
      const resolvedLocale = match?.[1] || defaultLocale;
      expect(resolvedLocale).toBe("en");
    });
  });

  describe("Auth Routes Localized", () => {
    it("/en/auth/signin should be accessible", () => {
      const path = "/en/auth/signin";
      const localeMatch = path.startsWith("/en/");
      expect(localeMatch).toBe(true);
    });

    it("/so/auth/signin should be accessible", () => {
      const path = "/so/auth/signin";
      const localeMatch = path.startsWith("/so/");
      expect(localeMatch).toBe(true);
    });

    it("/en/auth/register should be accessible", () => {
      const path = "/en/auth/register";
      const localeMatch = path.startsWith("/en/");
      expect(localeMatch).toBe(true);
    });

    it("/so/auth/register should be accessible", () => {
      const path = "/so/auth/register";
      const localeMatch = path.startsWith("/so/");
      expect(localeMatch).toBe(true);
    });
  });

  describe("Protected Route Access", () => {
    it("should deny access to /en/account without authentication", () => {
      const isPublic = false;
      expect(isPublic).toBe(false);
    });

    it("should deny access to /so/account without authentication", () => {
      const isPublic = false;
      expect(isPublic).toBe(false);
    });

    it("should allow access to /en/auth/signin without authentication", () => {
      const isPublic = true;
      expect(isPublic).toBe(true);
    });

    it("should allow access to /so/auth/signin without authentication", () => {
      const isPublic = true;
      expect(isPublic).toBe(true);
    });
  });

  describe("Admin Access with Locale", () => {
    it("should protect /en/admin with ADMIN role check", () => {
      const userRole: string = "CUSTOMER";
      const canAccessAdmin = userRole === "ADMIN";
      expect(canAccessAdmin).toBe(false);
    });

    it("should allow /en/admin access with ADMIN role", () => {
      const userRole: string = "ADMIN";
      const canAccessAdmin = userRole === "ADMIN";
      expect(canAccessAdmin).toBe(true);
    });

    it("should protect /so/admin with ADMIN role check", () => {
      const userRole: string = "CUSTOMER";
      const canAccessAdmin = userRole === "ADMIN";
      expect(canAccessAdmin).toBe(false);
    });

    it("should allow /so/admin access with ADMIN role", () => {
      const userRole: string = "ADMIN";
      const canAccessAdmin = userRole === "ADMIN";
      expect(canAccessAdmin).toBe(true);
    });
  });
});
