"use client";

/**
 * Cart page (HUR-190, U9/U10 / PRD R8, R10).
 *
 * Branches by auth status:
 *   - Guest: reads `useCartStore` (localStorage), re-prices live via
 *     POST /api/cart/price (Iron Rule #1 -- never trusts a stored price).
 *   - Authenticated: GET /api/cart (DB-backed, already live-priced
 *     server-side); every mutation (quantity change, remove) round-trips
 *     through /api/cart and re-renders from its response, so the displayed
 *     total is always server-computed, never client-arithmetic on a stale
 *     number.
 *
 * Coupon (U10, validation only -- HUB-38 owns redemption/checkout): a single
 * applied coupon, replacing any previous one (scope item 11 -- no stacking).
 */

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useCartStore } from "@/store/cartStore";
import { localeField } from "@/lib/locale-field";
import type { CouponValidationResult } from "@/lib/storefront/coupon";

interface PricedLine {
  cartItemId?: string;
  productId: string;
  variantId: string | null;
  slug: string;
  nameEn: string;
  nameSo: string;
  image: string | null;
  quantity: number;
  unitPriceUsd: number;
  lineTotalUsd: number;
  inStock: boolean;
  insufficientStock: boolean;
  productActive: boolean;
}

interface PricedCart {
  lines: PricedLine[];
  subtotalUsd: number;
}

export const dynamic = "force-dynamic";

export default function CartPage() {
  const t = useTranslations();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const nameField = localeField(locale, "name");

  const { status } = useSession();
  const guestItems = useCartStore((s) => s.items);
  const updateGuestQuantity = useCartStore((s) => s.updateQuantity);
  const removeGuestItem = useCartStore((s) => s.removeItem);

  const [cart, setCart] = useState<PricedCart>({ lines: [], subtotalUsd: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<CouponValidationResult | null>(null);
  const [couponError, setCouponError] = useState(false);

  const isAuthenticated = status === "authenticated";

  // --- Load / re-price the cart ---------------------------------------
  useEffect(() => {
    if (status === "loading") return;

    let cancelled = false;

    // Reset loading/error state inside the promise chain rather than
    // synchronously in the effect body -- this re-runs on every guest-item
    // change and auth-status flip, so a prior loadError must clear on
    // retry, not just settle at the end. Nesting the reset in a `.then()`
    // (vs. a bare top-level call) is what keeps this out of the
    // set-state-in-effect lint rule.
    Promise.resolve()
      .then(() => {
        if (cancelled) return Promise.reject(new Error("cancelled"));
        setIsLoading(true);
        setLoadError(false);
        return isAuthenticated
          ? fetch("/api/cart")
          : fetch("/api/cart/price", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: guestItems }),
            });
      })
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<PricedCart>;
      })
      .then((data) => {
        if (!cancelled) setCart(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Re-fetch on auth-status flip and whenever the guest item list changes
    // (quantity edits / removals for guests are purely local, so re-price
    // after each local change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAuthenticated, JSON.stringify(guestItems)]);

  // --- Quantity / remove handlers --------------------------------------
  function handleQuantityChange(line: PricedLine, nextQuantity: number) {
    if (isAuthenticated) {
      if (!line.cartItemId) return;
      startTransition(async () => {
        const res = await fetch("/api/cart", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cartItemId: line.cartItemId, quantity: nextQuantity }),
        });
        if (res.ok) setCart(await res.json());
      });
      return;
    }
    updateGuestQuantity(line.productId, line.variantId, nextQuantity);
  }

  function handleRemove(line: PricedLine) {
    if (isAuthenticated) {
      if (!line.cartItemId) return;
      startTransition(async () => {
        const res = await fetch("/api/cart", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cartItemId: line.cartItemId }),
        });
        if (res.ok) setCart(await res.json());
      });
      return;
    }
    removeGuestItem(line.productId, line.variantId);
  }

  function handleApplyCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setCouponError(false);
    startTransition(async () => {
      try {
        const res = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: couponCode.trim(), subtotalUsd: cart.subtotalUsd }),
        });
        if (!res.ok) {
          setCouponError(true);
          return;
        }
        // A newly-applied coupon always replaces any previous one (R10: single coupon, no stacking).
        setCouponResult((await res.json()) as CouponValidationResult);
      } catch {
        setCouponError(true);
      }
    });
  }

  function couponReasonLabel(result: Extract<CouponValidationResult, { valid: false }>): string {
    switch (result.reason) {
      case "not_found":
        return t("cart.couponNotFound");
      case "inactive":
        return t("cart.couponInactive");
      case "expired":
        return t("cart.couponExpired");
      case "usage_cap_reached":
        return t("cart.couponUsageCapReached");
      case "minimum_order_not_met":
        return t("cart.couponMinimumOrderNotMet");
      default:
        return t("common.error");
    }
  }

  const discountUsd = couponResult?.valid ? couponResult.discountUsd : 0;
  const totalUsd = Math.max(0, cart.subtotalUsd - discountUsd);

  return (
    <main className="mx-auto max-w-5xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">{t("cart.title")}</h1>

      <div className="mt-8">
        {isLoading ? (
          <p className="text-zinc-600">{t("common.loading")}</p>
        ) : loadError ? (
          <p className="text-zinc-600">{t("cart.loadError")}</p>
        ) : cart.lines.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
            <p className="text-zinc-600">{t("cart.empty")}</p>
            <Link
              href={`/${locale}`}
              className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {t("cart.browseProducts")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <ul className="lg:col-span-2 flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
              {cart.lines.map((line) => (
                <li key={`${line.productId}::${line.variantId ?? ""}`} className="flex gap-4 p-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-100">
                    {line.image ? (
                      <Image
                        src={line.image}
                        alt={line[nameField]}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <Link
                      href={`/${locale}/products/${line.slug}`}
                      className="font-medium hover:underline"
                    >
                      {line[nameField]}
                    </Link>
                    <span className="text-sm text-zinc-600">${line.unitPriceUsd.toFixed(2)}</span>
                    {!line.productActive ? (
                      <span className="text-xs font-medium text-error">
                        {t("cart.unavailable")}
                      </span>
                    ) : !line.inStock ? (
                      <span className="text-xs font-medium text-error">{t("cart.outOfStock")}</span>
                    ) : line.insufficientStock ? (
                      <span className="text-xs font-medium text-error">
                        {t("cart.insufficientStock")}
                      </span>
                    ) : null}
                    <div className="mt-1 flex items-center gap-2">
                      <label
                        className="sr-only"
                        htmlFor={`qty-${line.productId}-${line.variantId ?? ""}`}
                      >
                        {t("product.quantity")}
                      </label>
                      <input
                        id={`qty-${line.productId}-${line.variantId ?? ""}`}
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        disabled={isPending}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (Number.isFinite(next) && Number.isInteger(next) && next > 0) {
                            handleQuantityChange(line, next);
                          }
                        }}
                        className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemove(line)}
                        disabled={isPending}
                        className="text-sm font-medium text-zinc-500 hover:text-error"
                      >
                        {t("cart.remove")}
                      </button>
                    </div>
                  </div>
                  <span className="font-semibold">${line.lineTotalUsd.toFixed(2)}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4">
              <form onSubmit={handleApplyCoupon} className="flex flex-col gap-2">
                <label htmlFor="coupon" className="text-sm font-medium text-zinc-900">
                  {t("cart.couponCode")}
                </label>
                <div className="flex gap-2">
                  <input
                    id="coupon"
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    {t("cart.applyCoupon")}
                  </button>
                </div>
                {couponResult?.valid ? (
                  <p className="text-sm text-success">{t("cart.couponApplied")}</p>
                ) : couponResult && !couponResult.valid ? (
                  <p className="text-sm text-error">{couponReasonLabel(couponResult)}</p>
                ) : couponError ? (
                  <p className="text-sm text-error">{t("common.error")}</p>
                ) : null}
              </form>

              <dl className="flex flex-col gap-1 border-t border-zinc-200 pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-600">{t("cart.subtotal")}</dt>
                  <dd>${cart.subtotalUsd.toFixed(2)}</dd>
                </div>
                {discountUsd > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-zinc-600">{t("cart.discount")}</dt>
                    <dd>-${discountUsd.toFixed(2)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-semibold">
                  <dt>{t("cart.total")}</dt>
                  <dd>${totalUsd.toFixed(2)}</dd>
                </div>
              </dl>

              <Link
                href={`/${locale}/checkout`}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {t("cart.checkout")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
