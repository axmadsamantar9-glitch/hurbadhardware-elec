"use client";

/**
 * PDP variant selector (U7): one button-group per attribute key (e.g.
 * "storage", "color") derived from ProductVariant.attributes. Selecting a
 * full combination that matches an active variant surfaces that variant's
 * price/SKU/stock status; an unmatched combination shows a "not available"
 * note instead of guessing.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  findMatchingVariant,
  groupVariantOptions,
  readVariantAttributes,
  type VariantAttributes,
} from "@/lib/storefront/variants";
import type { ProductVariant } from "@/types/database";

type PublicVariant = Omit<ProductVariant, "stockQuantity"> & { inStock: boolean };

interface VariantSelectorProps {
  variants: PublicVariant[];
}

export function VariantSelector({ variants }: VariantSelectorProps) {
  const t = useTranslations();
  const options = useMemo(() => groupVariantOptions(variants), [variants]);
  const attributeKeys = Object.keys(options);

  const [selection, setSelection] = useState<VariantAttributes>(() => {
    const initial: VariantAttributes = {};
    const first = variants.find((v) => v.isActive);
    if (first) {
      return readVariantAttributes(first.attributes);
    }
    return initial;
  });

  if (attributeKeys.length === 0) return null;

  const matched = findMatchingVariant(variants, selection);

  return (
    <div className="flex flex-col gap-4">
      {attributeKeys.map((key) => (
        <div key={key} className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground capitalize">{key}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={key}>
            {options[key].map((value) => {
              const isSelected = selection[key] === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelection((prev) => ({ ...prev, [key]: value }))}
                  className={
                    "min-h-9 rounded-lg border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
                    (isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input-border bg-transparent text-foreground hover:bg-muted")
                  }
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {matched ? (
        <p className="text-sm text-muted-foreground">
          {matched.sku} — ${matched.priceUsd.toString()} —{" "}
          {matched.inStock ? t("product.inStock") : t("product.outOfStock")}
        </p>
      ) : (
        <p className="text-sm text-error">{t("product.variantUnavailable")}</p>
      )}
    </div>
  );
}
