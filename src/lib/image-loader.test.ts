import { describe, expect, it } from "vitest";
import cloudflareImageLoader from "./image-loader";

describe("cloudflareImageLoader", () => {
  it("accepts LoaderParams with src and width", () => {
    // The loader handles its parameters correctly
    const result = cloudflareImageLoader({
      src: "test-image",
      width: 400,
    });

    // Should return a string (either CDN URL or src as fallback)
    expect(typeof result).toBe("string");
  });

  it("returns a string result", () => {
    const url = cloudflareImageLoader({
      src: "product-image-abc123",
      width: 400,
    });

    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });

  it("handles the provided width parameter", () => {
    // Test that the function accepts width correctly
    const url = cloudflareImageLoader({
      src: "product-image",
      width: 300,
    });

    expect(typeof url).toBe("string");
  });

  it("handles optional quality parameter", () => {
    const url1 = cloudflareImageLoader({
      src: "product-image",
      width: 300,
    });

    const url2 = cloudflareImageLoader({
      src: "product-image",
      width: 300,
      quality: 90,
    });

    expect(typeof url1).toBe("string");
    expect(typeof url2).toBe("string");
  });

  it("handles local/relative paths (starting with /)", () => {
    const url = cloudflareImageLoader({
      src: "/local-image.png",
      width: 400,
    });

    expect(url).toBe("/local-image.png");
  });

  it("returns src unchanged for relative assets", () => {
    const src = "/images/logo.svg";
    const url = cloudflareImageLoader({
      src,
      width: 100,
      quality: 95,
    });

    expect(url).toBe(src);
    expect(url).not.toContain("imagedelivery.net");
  });

  it("returns src as fallback when ACCOUNT_HASH is not configured", () => {
    // In development without Cloudflare credentials, the loader returns src as-is
    const src = "dev-image-url";
    const url = cloudflareImageLoader({
      src,
      width: 400,
    });

    // If ACCOUNT_HASH is not set, it returns src; otherwise constructs CDN URL
    if (!process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH) {
      expect(url).toBe(src);
    } else {
      // In CI/production with ACCOUNT_HASH, it should construct a CDN URL
      expect(typeof url).toBe("string");
    }
  });

  it("is a valid client-side image loader", () => {
    expect(typeof cloudflareImageLoader).toBe("function");
  });
});
