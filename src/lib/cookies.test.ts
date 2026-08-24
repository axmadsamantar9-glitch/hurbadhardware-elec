import { describe, expect, it, vi } from "vitest";
import { setSecureCookie } from "./cookies";
import type { NextResponse } from "next/server";

describe("setSecureCookie", () => {
  it("enforces Secure flag", () => {
    const mockCookies = {
      set: vi.fn(),
    };
    const mockResponse = {
      cookies: mockCookies,
    } as unknown as NextResponse;

    setSecureCookie(mockResponse, "session", "abc123");

    expect(mockCookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: true,
      })
    );
  });

  it("enforces HttpOnly flag", () => {
    const mockCookies = {
      set: vi.fn(),
    };
    const mockResponse = {
      cookies: mockCookies,
    } as unknown as NextResponse;

    setSecureCookie(mockResponse, "session", "abc123");

    expect(mockCookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        httpOnly: true,
      })
    );
  });

  it("enforces SameSite=Lax for CSRF protection", () => {
    const mockCookies = {
      set: vi.fn(),
    };
    const mockResponse = {
      cookies: mockCookies,
    } as unknown as NextResponse;

    setSecureCookie(mockResponse, "session", "abc123");

    expect(mockCookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        sameSite: "lax",
      })
    );
  });

  it("sets the default path to / when not specified", () => {
    const mockCookies = {
      set: vi.fn(),
    };
    const mockResponse = {
      cookies: mockCookies,
    } as unknown as NextResponse;

    setSecureCookie(mockResponse, "session", "abc123");

    expect(mockCookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/",
      })
    );
  });

  it("uses a custom path when provided", () => {
    const mockCookies = {
      set: vi.fn(),
    };
    const mockResponse = {
      cookies: mockCookies,
    } as unknown as NextResponse;

    setSecureCookie(mockResponse, "session", "abc123", { path: "/admin" });

    expect(mockCookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/admin",
      })
    );
  });

  it("sets maxAge when provided in options", () => {
    const mockCookies = {
      set: vi.fn(),
    };
    const mockResponse = {
      cookies: mockCookies,
    } as unknown as NextResponse;

    const oneHour = 3600;
    setSecureCookie(mockResponse, "session", "abc123", { maxAge: oneHour });

    expect(mockCookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        maxAge: oneHour,
      })
    );
  });

  it("accepts options argument and respects default values", () => {
    const mockCookies = {
      set: vi.fn(),
    };
    const mockResponse = {
      cookies: mockCookies,
    } as unknown as NextResponse;

    setSecureCookie(mockResponse, "session", "abc123", {});

    expect(mockCookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "session",
        value: "abc123",
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      })
    );
  });

  it("enforces all security flags together: Secure, HttpOnly, SameSite=Lax", () => {
    const mockCookies = {
      set: vi.fn(),
    };
    const mockResponse = {
      cookies: mockCookies,
    } as unknown as NextResponse;

    setSecureCookie(mockResponse, "token", "secret-value");

    expect(mockCookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: "lax",
      })
    );
  });

  it("sets cookie name and value correctly", () => {
    const mockCookies = {
      set: vi.fn(),
    };
    const mockResponse = {
      cookies: mockCookies,
    } as unknown as NextResponse;

    setSecureCookie(mockResponse, "session", "abc123");

    expect(mockCookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "session",
        value: "abc123",
      })
    );
  });
});
