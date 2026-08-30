"use client";

/**
 * Debounced (~300ms) product search input (U6). Updates the `q` URL query
 * param on change, which the server-rendered listing page reads on the next
 * request/navigation — this component itself never fetches, it only drives
 * the URL (shareable/bookmarkable per the ticket's requirement).
 */

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { debounce } from "@/lib/storefront/debounce";
import { buildFilterHref, parseStorefrontSearchParams } from "@/lib/storefront/query-state";

const DEBOUNCE_MS = 300;

interface SearchBarProps {
  /** Translated placeholder/aria-label text (e.g. "Search products…"). */
  label: string;
}

export function SearchBar({ label }: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";

  const [value, setValue] = useState(urlQ);

  // Keep the input in sync if the URL changes from elsewhere (e.g. a "clear
  // filters" action, or browser back/forward navigation). Adjusted during
  // render (not an effect) per React's "you might not need an effect"
  // guidance — mirrors CategoryNav's `lastPathname` pattern.
  const [lastUrlQ, setLastUrlQ] = useState(urlQ);
  if (urlQ !== lastUrlQ) {
    setLastUrlQ(urlQ);
    setValue(urlQ);
  }

  const debounced = useMemo(
    () =>
      debounce((next: string) => {
        const state = parseStorefrontSearchParams(searchParams);
        router.push(buildFilterHref(pathname, state, { q: next }), { scroll: false });
      }, DEBOUNCE_MS),
    [pathname, router, searchParams]
  );

  useEffect(() => () => debounced.cancel(), [debounced]);

  return (
    <Input
      type="search"
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        debounced.call(next);
      }}
      placeholder={label}
      aria-label={label}
      className="w-full sm:max-w-xs"
    />
  );
}
