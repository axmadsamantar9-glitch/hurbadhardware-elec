import Link from "next/link";

interface PaginationProps {
  page: number;
  hasMore: boolean;
  /** Build the href for a given page number (keeps the base path/other query params). */
  buildHref: (page: number) => string;
  labels: { previous: string; next: string };
}

/** Simple prev/next pager for category product grids (U6). */
export function Pagination({ page, hasMore, buildHref, labels }: PaginationProps) {
  if (page <= 1 && !hasMore) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 py-6">
      {page > 1 ? (
        <Link
          href={buildHref(page - 1)}
          className="min-h-11 rounded-lg border border-input-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          {labels.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">{page}</span>
      {hasMore ? (
        <Link
          href={buildHref(page + 1)}
          className="min-h-11 rounded-lg border border-input-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          {labels.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
