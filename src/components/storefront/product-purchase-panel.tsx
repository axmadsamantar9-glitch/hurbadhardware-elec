"use client";

/**
 * PDP purchase panel (HUR-190, U9): wires `VariantSelector`'s matched-variant
 * state into `AddToCartButton` so the correct variant (if any) is added.
 * Server component parent (the PDP page) just passes the public product's
 * id/variants/stock through -- all client state lives here.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { VariantSelector } from "@/components/storefront/variant-selector";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import type { ProductVariant } from "@/types/database";

type PublicVariant = Omit<ProductVariant, "stockQuantity"> & { inStock: boolean };

interface ProductPurchasePanelProps {
  productId: string;
  variants: PublicVariant[];
  /** Whether the base product (no variants) is currently in stock. */
  inStock: boolean;
}

export function ProductPurchasePanel({ productId, variants, inStock }: ProductPurchasePanelProps) {
  const t = useTranslations();
  const [selectedVariant, setSelectedVariant] = useState<PublicVariant | undefined>(undefined);

  const hasVariants = variants.length > 0;
  const disabled = hasVariants ? !selectedVariant || !selectedVariant.inStock : !inStock;

  return (
    <div className="flex flex-col gap-4">
      {hasVariants ? (
        <VariantSelector variants={variants} onMatchedVariantChange={setSelectedVariant} />
      ) : null}
      <AddToCartButton
        productId={productId}
        variantId={selectedVariant?.id ?? null}
        disabled={disabled}
        labels={{
          add: t("product.addToCart"),
          added: t("cart.itemAdded"),
          unavailable: t("product.outOfStock"),
        }}
      />
    </div>
  );
}
