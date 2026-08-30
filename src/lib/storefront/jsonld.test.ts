import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { buildBreadcrumbJsonLd, buildProductJsonLd } from "./jsonld";
import type { PublicProductWithRelations } from "@/lib/api/serialize-product";

describe("buildBreadcrumbJsonLd", () => {
  it("builds a schema.org BreadcrumbList with 1-based positions", () => {
    const result = buildBreadcrumbJsonLd([
      { name: "Home", url: "https://example.com/en" },
      { name: "Smartphones", url: "https://example.com/en/category/smartphones" },
    ]);

    expect(result["@type"]).toBe("BreadcrumbList");
    expect(result.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://example.com/en" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Smartphones",
        item: "https://example.com/en/category/smartphones",
      },
    ]);
  });
});

function makeProduct(overrides: Partial<PublicProductWithRelations> = {}) {
  return {
    id: "p1",
    nameEn: "Galaxy A55",
    nameSo: "Galaxy A55 (SO)",
    slug: "galaxy-a55",
    descriptionEn: "A great phone",
    descriptionSo: "Taleefan wanaagsan",
    brandId: "b1",
    manufacturerId: null,
    brandNameCache: "Samsung",
    sku: "SKU-1",
    basePriceUsd: new Decimal("299.99"),
    categoryId: "cat1",
    isActive: true,
    isFeatured: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    compatibilityWarningEn: null,
    compatibilityWarningSo: null,
    inStock: true,
    images: [
      {
        id: "img1",
        productId: "p1",
        url: "img-1",
        altEn: null,
        altSo: null,
        position: 1,
        isPrimary: false,
      },
      {
        id: "img2",
        productId: "p1",
        url: "img-0",
        altEn: null,
        altSo: null,
        position: 0,
        isPrimary: true,
      },
    ],
    specs: [],
    variants: [],
    category: {
      id: "cat1",
      nameEn: "Smartphones",
      nameSo: "Taleefanada",
      slug: "smartphones",
      parentId: null,
      imageUrl: null,
      sortOrder: 0,
      isActive: true,
    },
    brand: {
      id: "b1",
      nameEn: "Samsung",
      nameSo: "Samsung",
      slug: "samsung",
      logoUrl: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    manufacturer: null,
    ...overrides,
  } as unknown as PublicProductWithRelations;
}

describe("buildProductJsonLd", () => {
  it("builds a schema.org Product with the English name/description at locale=en", () => {
    const product = makeProduct();
    const result = buildProductJsonLd(product, {
      url: "https://example.com/en/products/galaxy-a55",
      locale: "en",
    });

    expect(result["@type"]).toBe("Product");
    expect(result.name).toBe("Galaxy A55");
    expect(result.description).toBe("A great phone");
    expect(result.sku).toBe("SKU-1");
    expect(result.brand).toEqual({ "@type": "Brand", name: "Samsung" });
    expect(result.offers).toEqual({
      "@type": "Offer",
      url: "https://example.com/en/products/galaxy-a55",
      priceCurrency: "USD",
      price: "299.99",
      availability: "https://schema.org/InStock",
    });
  });

  it("uses the Somali name/description at locale=so", () => {
    const product = makeProduct();
    const result = buildProductJsonLd(product, {
      url: "https://example.com/so/products/galaxy-a55",
      locale: "so",
    });

    expect(result.name).toBe("Galaxy A55 (SO)");
    expect(result.description).toBe("Taleefan wanaagsan");
  });

  it("orders images with the primary image first", () => {
    const product = makeProduct();
    const result = buildProductJsonLd(product, { url: "https://x", locale: "en" });
    expect(result.image).toEqual(["img-0", "img-1"]);
  });

  it("marks availability OutOfStock when inStock is false", () => {
    const product = makeProduct({ inStock: false });
    const result = buildProductJsonLd(product, { url: "https://x", locale: "en" });
    expect(result.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("omits brand when the product has no brand", () => {
    const product = makeProduct({ brand: null });
    const result = buildProductJsonLd(product, { url: "https://x", locale: "en" });
    expect(result.brand).toBeUndefined();
  });

  it("never includes stockQuantity (Iron Rule #6)", () => {
    const product = makeProduct();
    const result = buildProductJsonLd(product, { url: "https://x", locale: "en" });
    expect(JSON.stringify(result)).not.toContain("stockQuantity");
  });
});
