"use client";

/**
 * Category navigation (U8): a horizontal tab bar on desktop (`sm:` and up),
 * collapsing to a hamburger menu below that. Mirrors the disclosure pattern
 * already established by `src/components/language-switcher.tsx` (Escape to
 * close, click-outside to close, focus returns to the trigger — WCAG 2.4.3 /
 * 2.1.2) and `docs/standards/accessibility.md`'s menu convention
 * (`role="menu"` container, `role="menuitem"` real `<button>`s or, here,
 * real `<a>`/`Link`s since each item navigates).
 */

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { localeField } from "@/lib/locale-field";
import type { CategoryNode } from "@/lib/api/categories";

interface CategoryNavProps {
  categories: CategoryNode[];
}

export function CategoryNav({ categories }: CategoryNavProps) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const nameField = localeField(locale, "name");

  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the mobile menu automatically on route change (category selected).
  // Adjusted during render (not an effect) per React's "you might not need
  // an effect" guidance — an effect here would setState synchronously on
  // every pathname change, triggering an extra cascading render.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
  }

  const closeMenu = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen, closeMenu]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") && !isOpen) {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  if (categories.length === 0) return null;

  return (
    <nav aria-label={t("nav.categories")} className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Desktop: horizontal tab bar (sm: and up). */}
        <ul className="hidden flex-wrap gap-x-6 gap-y-2 py-3 sm:flex">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/${locale}/category/${category.slug}`}
                className="text-sm font-medium text-foreground hover:text-primary-text"
              >
                {category[nameField]}
              </Link>
            </li>
          ))}
        </ul>

        {/* Mobile: hamburger trigger + disclosure menu (base, hidden from sm: up). */}
        <div className="sm:hidden">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            onKeyDown={handleTriggerKeyDown}
            aria-expanded={isOpen}
            aria-haspopup="menu"
            aria-label={t("nav.categories")}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          {isOpen ? (
            <div
              ref={menuRef}
              role="menu"
              aria-label={t("nav.categories")}
              className="flex flex-col gap-1 border-t border-border py-2"
            >
              {categories.map((category) => (
                <Link
                  key={category.id}
                  role="menuitem"
                  href={`/${locale}/category/${category.slug}`}
                  className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                >
                  {category[nameField]}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
