"use client";

/**
 * Checkout page (HUR-191, U11 / PRD R11).
 *
 * Flow: address selection/entry -> order review -> payment selection
 * (informational only -- HUB-40 owns real gateway integration) -> summary
 * -> order creation (POST /api/checkout).
 *
 * Every price/subtotal/discount/tax/total figure shown here is either (a)
 * fetched live from GET /api/cart (server-authoritative, Iron Rule #1) or
 * (b) the response of the final POST /api/checkout call -- never a
 * client-computed number sent back to the server. `placeOrder()`
 * (src/lib/api/checkout.ts) re-derives everything from the DB inside its
 * own transaction regardless of what this page displays.
 *
 * Requires an authenticated session -- guest checkout is not in scope for
 * this ticket (the DB cart, address book, and order all require a
 * `userId`).
 */

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { CountryCode } from "@/types/database";

interface PricedLine {
  cartItemId?: string;
  productId: string;
  variantId: string | null;
  nameEn: string;
  nameSo: string;
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

interface AddressRecord {
  id: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  country: CountryCode;
  isDefault: boolean;
}

type Step = "address" | "review" | "payment" | "summary";

const COUNTRIES: CountryCode[] = ["SO", "KE", "ET"];

type CheckoutErrorCode =
  | "cart_empty"
  | "address_not_found"
  | "product_unavailable"
  | "insufficient_stock"
  | "coupon_invalid"
  | "coupon_no_longer_valid"
  | "internal_error"
  | "validation_error";

export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  const t = useTranslations();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const nameField = locale === "so" ? "nameSo" : "nameEn";

  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  const [step, setStep] = useState<Step>("address");
  const [isPending, startTransition] = useTransition();

  const [cart, setCart] = useState<PricedCart>({ lines: [], subtotalUsd: 0 });
  const [cartLoaded, setCartLoaded] = useState(false);

  const [addresses, setAddresses] = useState<AddressRecord[]>([]);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressFormError, setAddressFormError] = useState(false);

  const [couponCode] = useState<string>("");

  const [placeOrderError, setPlaceOrderError] = useState<CheckoutErrorCode | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [placedTotalUsd, setPlacedTotalUsd] = useState<number | null>(null);

  // --- Load cart + addresses --------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    fetch("/api/cart")
      .then((res) => (res.ok ? (res.json() as Promise<PricedCart>) : null))
      .then((data) => {
        if (!cancelled && data) setCart(data);
      })
      .finally(() => {
        if (!cancelled) setCartLoaded(true);
      });

    fetch("/api/address")
      .then((res) => (res.ok ? (res.json() as Promise<{ addresses: AddressRecord[] }>) : null))
      .then((data) => {
        if (!cancelled && data) {
          setAddresses(data.addresses);
          const defaultAddress = data.addresses.find((a) => a.isDefault) ?? data.addresses[0];
          if (defaultAddress) setSelectedAddressId(defaultAddress.id);
        }
      })
      .finally(() => {
        if (!cancelled) setAddressesLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  function handleAddAddress(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddressFormError(false);
    const form = new FormData(e.currentTarget);
    const payload = {
      fullName: String(form.get("fullName") ?? ""),
      phone: String(form.get("phone") ?? ""),
      addressLine1: String(form.get("addressLine1") ?? ""),
      addressLine2: String(form.get("addressLine2") ?? "") || undefined,
      city: String(form.get("city") ?? ""),
      state: String(form.get("state") ?? "") || undefined,
      country: String(form.get("country") ?? "SO") as CountryCode,
    };

    startTransition(async () => {
      const res = await fetch("/api/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setAddressFormError(true);
        return;
      }
      const { address } = (await res.json()) as { address: AddressRecord };
      setAddresses((prev) => [...prev, address]);
      setSelectedAddressId(address.id);
      setShowAddressForm(false);
    });
  }

  function handlePlaceOrder() {
    if (!selectedAddressId) return;
    setPlaceOrderError(null);

    startTransition(async () => {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressId: selectedAddressId,
          couponCode: couponCode.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPlaceOrderError((json?.error?.code as CheckoutErrorCode) ?? "internal_error");
        return;
      }
      setPlacedOrderId(json.orderId as string);
      setPlacedTotalUsd(json.totalUsd as number);
    });
  }

  function errorMessage(code: CheckoutErrorCode): string {
    switch (code) {
      case "cart_empty":
        return t("checkout.errorCartEmpty");
      case "address_not_found":
        return t("checkout.errorAddressNotFound");
      case "product_unavailable":
        return t("checkout.errorProductUnavailable");
      case "insufficient_stock":
        return t("checkout.errorInsufficientStock");
      case "coupon_invalid":
        return t("checkout.errorCouponInvalid");
      case "coupon_no_longer_valid":
        return t("checkout.errorCouponNoLongerValid");
      default:
        return t("checkout.errorGeneric");
    }
  }

  const discountUsd = 0; // No coupon UI wired on this page yet beyond the pass-through field above.
  const taxUsd = 0; // src/lib/storefront/tax.ts::calculateTax() is a $0 extension point pending a business decision.
  const totalUsd = Math.max(0, cart.subtotalUsd - discountUsd + taxUsd);

  const steps: Step[] = ["address", "review", "payment", "summary"];
  const stepLabel: Record<Step, string> = {
    address: t("checkout.stepAddress"),
    review: t("checkout.stepReview"),
    payment: t("checkout.stepPayment"),
    summary: t("checkout.stepSummary"),
  };

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-3xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <p className="text-zinc-600">{t("common.loading")}</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl flex-1 px-4 py-12 sm:px-6 lg:px-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("checkout.title")}</h1>
        <p className="mt-4 text-zinc-600">{t("checkout.signInRequired")}</p>
        <Link
          href={`/${locale}/auth/signin`}
          className="mt-6 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {t("checkout.signIn")}
        </Link>
      </main>
    );
  }

  if (placedOrderId) {
    return (
      <main className="mx-auto max-w-3xl flex-1 px-4 py-12 sm:px-6 lg:px-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("checkout.orderPlaced")}</h1>
        <p className="mt-4 text-zinc-600">
          {t("checkout.orderNumber", { orderId: placedOrderId })}
        </p>
        {placedTotalUsd !== null ? (
          <p className="mt-1 text-zinc-600">${placedTotalUsd.toFixed(2)}</p>
        ) : null}
        <Link
          href={`/${locale}`}
          className="mt-6 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {t("cart.browseProducts")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">{t("checkout.title")}</h1>

      <ol className="mt-6 flex gap-4 text-sm font-medium text-zinc-500">
        {steps.map((s, i) => (
          <li key={s} className={s === step ? "text-blue-600" : undefined}>
            {i + 1}. {stepLabel[s]}
          </li>
        ))}
      </ol>

      {cartLoaded && cart.lines.length === 0 ? (
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-8 text-center">
          <p className="text-zinc-600">{t("checkout.emptyCart")}</p>
          <Link
            href={`/${locale}`}
            className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {t("cart.browseProducts")}
          </Link>
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6">
          {step === "address" ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">{t("checkout.shippingAddress")}</h2>

              {!addressesLoaded ? (
                <p className="text-zinc-600">{t("common.loading")}</p>
              ) : addresses.length === 0 ? (
                <p className="text-zinc-600">{t("checkout.noAddresses")}</p>
              ) : (
                <fieldset className="flex flex-col gap-2">
                  <legend className="sr-only">{t("checkout.shippingAddress")}</legend>
                  {addresses.map((addr) => (
                    <label
                      key={addr.id}
                      className="flex items-start gap-3 rounded-md border border-zinc-200 p-3 text-sm has-[:checked]:border-blue-600"
                    >
                      <input
                        type="radio"
                        name="addressId"
                        value={addr.id}
                        checked={selectedAddressId === addr.id}
                        onChange={() => setSelectedAddressId(addr.id)}
                        aria-label={`${addr.fullName}, ${addr.addressLine1}, ${addr.city}`}
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-medium">{addr.fullName}</span>
                        <span className="block text-zinc-600">
                          {addr.addressLine1}
                          {addr.addressLine2 ? `, ${addr.addressLine2}` : ""}, {addr.city}
                          {addr.state ? `, ${addr.state}` : ""}, {addr.country}
                        </span>
                        <span className="block text-zinc-600">{addr.phone}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              {showAddressForm ? (
                <form
                  onSubmit={handleAddAddress}
                  className="flex flex-col gap-3 border-t border-zinc-200 pt-4"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                      {t("checkout.fullName")}
                      <input
                        name="fullName"
                        required
                        className="rounded-md border border-zinc-300 px-2 py-1.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      {t("checkout.phone")}
                      <input
                        name="phone"
                        required
                        className="rounded-md border border-zinc-300 px-2 py-1.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                      {t("checkout.addressLine1")}
                      <input
                        name="addressLine1"
                        required
                        className="rounded-md border border-zinc-300 px-2 py-1.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                      {t("checkout.addressLine2")}
                      <input
                        name="addressLine2"
                        className="rounded-md border border-zinc-300 px-2 py-1.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      {t("checkout.city")}
                      <input
                        name="city"
                        required
                        className="rounded-md border border-zinc-300 px-2 py-1.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      {t("checkout.state")}
                      <input
                        name="state"
                        className="rounded-md border border-zinc-300 px-2 py-1.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      {t("checkout.country")}
                      <select
                        name="country"
                        defaultValue="SO"
                        className="rounded-md border border-zinc-300 px-2 py-1.5"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {addressFormError ? (
                    <p className="text-sm text-error">{t("common.error")}</p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={isPending}
                    className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    {t("checkout.saveAddress")}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddressForm(true)}
                  className="self-start text-sm font-medium text-blue-600 hover:underline"
                >
                  {t("checkout.addNewAddress")}
                </button>
              )}

              <button
                type="button"
                disabled={!selectedAddressId}
                onClick={() => setStep("review")}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 transition-colors"
              >
                {t("checkout.continue")}
              </button>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">{t("checkout.reviewItems")}</h2>
              <ul className="flex flex-col divide-y divide-zinc-200">
                {cart.lines.map((line) => (
                  <li
                    key={`${line.productId}::${line.variantId ?? ""}`}
                    className="flex justify-between py-2 text-sm"
                  >
                    <span>
                      {line[nameField]} x{line.quantity}
                    </span>
                    <span>${line.lineTotalUsd.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <dl className="flex flex-col gap-1 border-t border-zinc-200 pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-600">{t("cart.subtotal")}</dt>
                  <dd>${cart.subtotalUsd.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-600">{t("checkout.tax")}</dt>
                  <dd>${taxUsd.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <dt>{t("cart.total")}</dt>
                  <dd>${totalUsd.toFixed(2)}</dd>
                </div>
              </dl>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("address")}
                  className="rounded-lg border border-zinc-300 px-4 py-2 font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t("checkout.back")}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("payment")}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  {t("checkout.continue")}
                </button>
              </div>
            </div>
          ) : null}

          {step === "payment" ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">{t("checkout.paymentMethod")}</h2>
              <p className="text-sm text-zinc-600">{t("checkout.paymentNote")}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("review")}
                  className="rounded-lg border border-zinc-300 px-4 py-2 font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t("checkout.back")}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("summary")}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  {t("checkout.continue")}
                </button>
              </div>
            </div>
          ) : null}

          {step === "summary" ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">{t("checkout.orderSummary")}</h2>
              <dl className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-600">{t("cart.subtotal")}</dt>
                  <dd>${cart.subtotalUsd.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-600">{t("checkout.tax")}</dt>
                  <dd>${taxUsd.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <dt>{t("cart.total")}</dt>
                  <dd>${totalUsd.toFixed(2)}</dd>
                </div>
              </dl>
              {placeOrderError ? (
                <p className="text-sm text-error">{errorMessage(placeOrderError)}</p>
              ) : null}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("payment")}
                  className="rounded-lg border border-zinc-300 px-4 py-2 font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t("checkout.back")}
                </button>
                <button
                  type="button"
                  disabled={isPending || !selectedAddressId}
                  onClick={handlePlaceOrder}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 transition-colors"
                >
                  {isPending ? t("checkout.placingOrder") : t("checkout.placeOrder")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
