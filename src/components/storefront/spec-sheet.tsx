import { localeField } from "@/lib/locale-field";
import { buildSpecSheet } from "@/lib/storefront/spec-sheet";
import type { ProductSpec, SpecTemplateKey } from "@/types/database";

interface SpecSheetProps {
  specs: ProductSpec[];
  template: SpecTemplateKey[];
  locale: string;
  title: string;
}

/** PDP specification table (U7), ordered using the category's SpecTemplateKey as a hint. */
export function SpecSheet({ specs, template, locale, title }: SpecSheetProps) {
  if (specs.length === 0) return null;

  const ordered = buildSpecSheet(specs, template);
  const keyField = localeField(locale, "key");
  const valueField = localeField(locale, "value");

  return (
    <section aria-labelledby="spec-sheet-heading">
      <h2 id="spec-sheet-heading" className="text-lg font-semibold text-foreground">
        {title}
      </h2>
      <dl className="mt-3 divide-y divide-border border-y border-border">
        {ordered.map((spec) => (
          <div key={spec.id} className="flex justify-between gap-4 py-2 text-sm">
            <dt className="text-muted-foreground">{spec[keyField]}</dt>
            <dd className="text-right font-medium text-foreground">{spec[valueField]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
