import { z } from "zod";

/**
 * Common Zod schemas for API requests and responses.
 * Schemas are split into PUBLIC (safe to expose to clients) and PRIVATE (internal only).
 *
 * PUBLIC schemas whitelist only fields that are safe to return to unauthenticated or
 * semi-trusted clients. They explicitly forbid PII (email, phone, name, address) to
 * prevent accidental data leakage.
 *
 * PRIVATE schemas include full data (PII, sensitive fields) for internal use only.
 *
 * Implementation rule (AC22): Every public API response uses PUBLIC variant.
 */

// === User Schemas ===

/**
 * Public user response: Only fields safe to return to browser/client
 */
export const userPublicSchema = z.object({
  id: z.string().uuid(),
  // name, email, phone OMITTED - PII, not returned to clients
  locale: z.enum(["en", "so"]).optional(),
  role: z.enum(["CUSTOMER", "ADMIN"]),
  createdAt: z.date(),
  // deletedAt and other sensitive fields OMITTED
});

export type UserPublic = z.infer<typeof userPublicSchema>;

/**
 * Private user response: Full data for internal use
 */
export const userPrivateSchema = userPublicSchema.extend({
  email: z.string().email(),
  name: z.string(),
  phone: z.string().optional(),
  address: z.string().optional(),
  deletedAt: z.date().nullable(),
});

export type UserPrivate = z.infer<typeof userPrivateSchema>;

// === Order Schemas ===

/**
 * Public order item response
 */
export const orderItemPublicSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  quantity: z.number().int().positive(),
  priceAtTime: z.number().positive(),
  total: z.number().positive(),
});

/**
 * Public order response: Omits shipping address, customer contact info
 */
export const orderPublicSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"]),
  items: z.array(orderItemPublicSchema),
  subtotal: z.number().positive(),
  shippingCost: z.number().nonnegative(),
  taxAmount: z.number().nonnegative(),
  totalAmount: z.number().positive(),
  // customerName, customerEmail, shippingAddress OMITTED - PII
  trackingNumber: z.string().optional(),
  createdAt: z.date(),
  estimatedDelivery: z.date().optional(),
});

export type OrderPublic = z.infer<typeof orderPublicSchema>;

/**
 * Private order response: Full data including PII
 */
export const orderPrivateSchema = orderPublicSchema.extend({
  customerId: z.string().uuid(),
  customerName: z.string(),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  shippingAddress: z.string(),
  billingAddress: z.string().optional(),
  updatedAt: z.date(),
});

export type OrderPrivate = z.infer<typeof orderPrivateSchema>;

// === Payment Schemas ===

/**
 * Public payment response: Omits gateway-specific tokens and customer PII
 */
export const paymentPublicSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED"]),
  amount: z.number().positive(),
  currency: z.string().length(3),
  gateway: z.enum(["MPESA", "EDAHAB", "WAAFIPAY", "CARD"]),
  lastFourDigits: z.string().regex(/^\d{4}$/),
  // gatewayTransactionId OMITTED from public (not needed client-side)
  // customerName, customerEmail OMITTED - PII
  createdAt: z.date(),
});

export type PaymentPublic = z.infer<typeof paymentPublicSchema>;

/**
 * Private payment response: Full data for reconciliation
 * Includes gatewayTransactionId (needed for matching webhook callbacks)
 */
export const paymentPrivateSchema = paymentPublicSchema.extend({
  customerId: z.string().uuid(),
  customerName: z.string(),
  customerEmail: z.string().email(),
  gatewayTransactionId: z.string(),
  idempotencyKey: z.string().optional(),
  updatedAt: z.date(),
});

export type PaymentPrivate = z.infer<typeof paymentPrivateSchema>;

// === Product Schemas (Already Public) ===

/**
 * Public product response: Safe to expose to all clients
 */
export const productPublicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  price: z.number().positive(),
  category: z.string(),
  images: z.array(
    z.object({
      id: z.string().uuid(),
      url: z.string().url(),
    })
  ),
  inStock: z.boolean(),
  createdAt: z.date(),
});

export type ProductPublic = z.infer<typeof productPublicSchema>;

// === Checkout Request Schemas (Public Input) ===

/**
 * Checkout request from client: Only fields client needs to provide
 * Forbids PII in the request body (client already authenticated; server has email/phone)
 */
export const checkoutRequestSchema = z.object({
  cartId: z.string().uuid(),
  paymentMethod: z.enum(["MPESA", "EDAHAB", "WAAFIPAY", "CARD"]),
  idempotencyKey: z.string().uuid().optional(), // AC6: Idempotency support
  // email, phone, name FORBIDDEN - client already authenticated
  // shipping address must come from user profile, not request body (prevents injection)
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

// === Utility Function ===

/**
 * Check if a schema object contains forbidden PII fields.
 * Used at development time to prevent accidental PII exposure.
 */
export function assertNoForbiddenPII(obj: Record<string, unknown>, forbiddenKeys: string[]): void {
  const keys = Object.keys(obj);
  const found = keys.filter((k) => forbiddenKeys.includes(k.toLowerCase()));
  if (found.length > 0) {
    throw new Error(
      `Forbidden PII fields in response: ${found.join(", ")}. Use PUBLIC schema variant.`
    );
  }
}
