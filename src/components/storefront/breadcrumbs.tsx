import Link from "next/link";
import {
  buildBreadcrumbJsonLd,
  toSafeJsonLdString,
  type BreadcrumbItem,
} from "@/lib/storefront/jsonld";

interface BreadcrumbsProps {
  /** Ordered from the site root ("Home") to the current page. The last item is not linked. */
  items: BreadcrumbItem[];
}

/**
 * Breadcrumb trail (`Home > Category`, U8) with a matching `BreadcrumbList`
 * JSON-LD script tag (U20) so the same data drives both the visible nav and
 * the structured-data markup — no risk of the two drifting apart.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const jsonLd = buildBreadcrumbJsonLd(items);

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm">
        <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={item.url} className="flex items-center gap-1">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-muted-foreground">
                    /
                  </span>
                ) : null}
                {isLast ? (
                  <span aria-current="page" className="font-medium text-foreground">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.url} className="hover:text-primary-text hover:underline">
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {/* JSON-LD requires raw <script> content; input is fully controlled (server-built object, never user HTML). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLdString(jsonLd) }}
      />
    </>
  );
}
