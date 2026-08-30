import { localeField } from "@/lib/locale-field";
import type { CompatibilityAttribute } from "@/types/database";

interface CompatibilityWarningsProps {
  attributes: CompatibilityAttribute[];
  /** Product-level general warning (Product.compatibilityWarningEn/So), if any. */
  productWarning: string | null;
  locale: string;
  title: string;
}

/**
 * Renders compatibility facts (HUB-28) plus any warnings on the PDP. Renders
 * nothing when there's neither a product-level warning nor any per-fact
 * warnings — most products have no compatibility data at all today.
 */
export function CompatibilityWarnings({
  attributes,
  productWarning,
  locale,
  title,
}: CompatibilityWarningsProps) {
  const valueField = localeField(locale, "value");
  const warningField = locale === "so" ? "warningSo" : "warningEn";
  const perFactWarnings = attributes.filter((a) => a[warningField]);

  if (!productWarning && perFactWarnings.length === 0 && attributes.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="compatibility-heading" className="flex flex-col gap-2">
      <h2 id="compatibility-heading" className="text-lg font-semibold text-foreground">
        {title}
      </h2>

      {attributes.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {attributes.map((attr) => (
            <li
              key={attr.id}
              className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
            >
              {attr[valueField]}
            </li>
          ))}
        </ul>
      ) : null}

      {productWarning ? (
        <p className="rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-sm text-foreground">
          {productWarning}
        </p>
      ) : null}

      {perFactWarnings.map((attr) => (
        <p
          key={attr.id}
          className="rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-sm text-foreground"
        >
          {attr[warningField]}
        </p>
      ))}
    </section>
  );
}
