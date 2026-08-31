/**
 * Authenticated (DB-backed) shipping address data layer (HUR-191, U11 /
 * PRD R11 checkout).
 *
 * Every function here takes a `userId` sourced from the server-side session
 * (never a client-supplied value — matches the cart/wishlist trust-boundary
 * precedent in src/lib/api/cart.ts, src/lib/api/wishlist.ts) and scopes
 * every query to that user's own addresses. `getOwnedAddress()` is the
 * function checkout's `placeOrder()` calls to verify a client-supplied
 * `addressId` actually belongs to the acting user before using it — never
 * trust an `addressId` blindly (HUR-191 security reminder).
 */

import { db } from "@/lib/db";
import type { Address, CountryCode } from "@/types/database";

export interface CreateAddressInput {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state?: string | null;
  country: CountryCode;
  isDefault?: boolean;
}

/** List the current user's saved addresses, most-recently-created last. */
export async function listAddresses(userId: string): Promise<Address[]> {
  return db.address.findMany({ where: { userId }, orderBy: { id: "asc" } });
}

/** Create a new address owned by `userId`. */
export async function createAddress(userId: string, input: CreateAddressInput): Promise<Address> {
  return db.address.create({
    data: {
      userId,
      fullName: input.fullName,
      phone: input.phone,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      city: input.city,
      state: input.state ?? null,
      country: input.country,
      isDefault: input.isDefault ?? false,
    },
  });
}

/**
 * Fetch an address only if it belongs to `userId` — returns `null`
 * otherwise (deleted, never existed, or owned by a different user). This is
 * the ownership check checkout must run server-side before using any
 * client-supplied `addressId` (never trust it blindly).
 */
export async function getOwnedAddress(userId: string, addressId: string): Promise<Address | null> {
  const address = await db.address.findUnique({ where: { id: addressId } });
  if (!address || address.userId !== userId) return null;
  return address;
}
