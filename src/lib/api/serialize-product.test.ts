import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { toPublicProduct, toPublicProducts } from "./serialize-product";
import type { ProductListItem, ProductWithRelations } from "@/types/database";

const baseProduct = {
  id: "1",
  nameEn: "Samsung Galaxy A55 5G",
  nameSo: "Samsung Galaxy A55 5G",
  slug: "samsung-galaxy-a55-5g",
  brand: {
    id: "b1",
    nameEn: "Samsung",
    nameSo: "Samsung",
    slug: "samsung",
    logoUrl: null,
    isActive: true,
  },
  sku: "SMP-SS-A55-001",
  basePriceUsd: new Decimal("349.00"),
  stockQuantity: 50,
  descriptionEn: "A great smartphone",
  descriptionSo: "Taleefan qababan",
  categoryId: "1",
  isActive: true,
  isFeatured: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  images: [
    {
      id: "img1",
      productId: "1",
      url: "https://example.com/img1.jpg",
      altEn: null,
      altSo: null,
      position: 0,
      isPrimary: true,
    },
  ],
  category: {
    id: "1",
    nameEn: "Smartphones",
    nameSo: "Taleefannada Casriga ah",
    slug: "smartphones",
    parentId: null,
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
  },
} as unknown as ProductListItem;

describe("toPublicProduct", () => {
  it("strips stockQuantity from a listing-card product and adds a boolean inStock", () => {
    const result = toPublicProduct(baseProduct);
    expect(result).not.toHaveProperty("stockQuantity");
    expect(result.inStock).toBe(true);
  });

  it("reports inStock=false when stockQuantity is zero", () => {
    const result = toPublicProduct({ ...baseProduct, stockQuantity: 0 });
    expect(result.inStock).toBe(false);
  });

  it("strips stockQuantity from each variant on a full product", () => {
    const fullProduct = {
      ...baseProduct,
      specs: [],
      variants: [
        {
          id: "v1",
          productId: "1",
          name: "128GB / Black",
          sku: "SMP-SS-A55-001-BLK",
          priceUsd: new Decimal("349.00"),
          stockQuantity: 5,
          attributes: null,
          isActive: true,
        },
        {
          id: "v2",
          productId: "1",
          name: "256GB / Blue",
          sku: "SMP-SS-A55-001-BLU",
          priceUsd: new Decimal("399.00"),
          stockQuantity: 0,
          attributes: null,
          isActive: true,
        },
      ],
    } as unknown as ProductWithRelations;

    const result = toPublicProduct(fullProduct);
    expect(result).not.toHaveProperty("stockQuantity");
    expect(result.inStock).toBe(true);
    expect(result.variants).toHaveLength(2);
    for (const v of result.variants) {
      expect(v).not.toHaveProperty("stockQuantity");
    }
    expect(result.variants[0].inStock).toBe(true);
    expect(result.variants[1].inStock).toBe(false);
  });
});

describe("toPublicProducts", () => {
  it("maps an array of products through toPublicProduct", () => {
    const results = toPublicProducts([baseProduct, { ...baseProduct, id: "2", stockQuantity: 0 }]);
    expect(results).toHaveLength(2);
    expect(results[0].inStock).toBe(true);
    expect(results[1].inStock).toBe(false);
    for (const r of results) expect(r).not.toHaveProperty("stockQuantity");
  });
});

// HUR-55 AC2: supplier data must never reach a public response, even if a
// future upstream query accidentally includes it.
describe("supplier redaction (HUR-55 AC2)", () => {
  it("strips `suppliers` from a listing-card product even when the underlying object has it", () => {
    const productWithSuppliers = {
      ...baseProduct,
      suppliers: [
        {
          productId: "1",
          supplierId: "s1",
          supplier: {
            id: "s1",
            name: "Acme Wholesale",
            contactName: "Jane Doe",
            contactEmail: "jane@acme.example",
            contactPhone: "+252611234567",
            notes: "Net-30 terms",
            isActive: true,
          },
        },
      ],
    } as unknown as ProductListItem;

    const result = toPublicProduct(productWithSuppliers);

    expect(result).not.toHaveProperty("suppliers");
    expect(JSON.stringify(result)).not.toMatch(/supplier/i);
  });

  it("strips `suppliers` from a full product-detail payload even when the underlying object has it", () => {
    const fullProductWithSuppliers = {
      ...baseProduct,
      specs: [],
      variants: [],
      suppliers: [
        {
          productId: "1",
          supplierId: "s1",
          supplier: { id: "s1", name: "Acme Wholesale", isActive: true },
        },
      ],
    } as unknown as ProductWithRelations;

    const result = toPublicProduct(fullProductWithSuppliers);

    expect(result).not.toHaveProperty("suppliers");
    expect(JSON.stringify(result)).not.toMatch(/supplier/i);
  });
});
