/**
 * Single import point for database types (U2).
 *
 * Application code should import model and enum types from here rather than
 * reaching into `@prisma/client` directly, so that a future generator or
 * client-location change touches one file instead of hundreds.
 */

// --- Model row types -------------------------------------------------------

export type {
  Account,
  Address,
  AuditLog,
  Cart,
  CartItem,
  Category,
  Coupon,
  FxRate,
  InventoryLog,
  Order,
  OrderItem,
  Payment,
  Product,
  ProductImage,
  ProductSpec,
  ProductVariant,
  Review,
  Session,
  User,
  VerificationToken,
  WhatsappSession,
  Wishlist,
} from '@prisma/client'

// --- Enums -----------------------------------------------------------------
// Exported as values, not just types, so they can be used at runtime
// (e.g. `role === Role.ADMIN`, or as Zod `z.nativeEnum(...)` inputs).

export {
  CountryCode,
  CouponType,
  Currency,
  FxBase,
  FxQuote,
  Locale,
  OrderStatus,
  PaymentGateway,
  PaymentMethod,
  PaymentStatus,
  Role,
} from '@prisma/client'

// --- Utility types ---------------------------------------------------------

export { Prisma } from '@prisma/client'

/**
 * Money and FX columns come back as `Decimal`, never `number`. Convert with
 * `.toNumber()` / `.toFixed(2)` at the boundary — Decimal instances are not
 * serialisable across the React server/client boundary.
 */
export type { Decimal } from '@prisma/client/runtime/library'

// --- Common query payloads -------------------------------------------------

import type { Prisma as PrismaNamespace } from '@prisma/client'

/** Product with everything a product detail page renders. */
export type ProductWithRelations = PrismaNamespace.ProductGetPayload<{
  include: {
    images: true
    specs: true
    variants: true
    category: true
  }
}>

/** Product shaped for a listing card: primary image and category name only. */
export type ProductListItem = PrismaNamespace.ProductGetPayload<{
  include: {
    images: true
    category: true
  }
}>

/** Category joined with its immediate children, for nav menus. */
export type CategoryWithChildren = PrismaNamespace.CategoryGetPayload<{
  include: { children: true }
}>

/** Cart with enough detail to price and render the mini-cart. */
export type CartWithItems = PrismaNamespace.CartGetPayload<{
  include: {
    items: {
      include: {
        product: { include: { images: true } }
        variant: true
      }
    }
  }
}>

/** Order with line items and payment attempts, for order detail and admin. */
export type OrderWithDetails = PrismaNamespace.OrderGetPayload<{
  include: {
    items: true
    payments: true
    shippingAddress: true
    coupon: true
  }
}>
