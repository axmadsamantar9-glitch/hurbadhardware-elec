# Model Reference: All 22 Entities

Complete documentation of every model in the HurbadHardware schema. Organized by domain (Identity, Catalog, Shopping, Commerce, Operations).

---

## Identity & Auth (5 models)

### User

**Purpose:** Platform user account (customer or admin) with authentication, profile, and localization.

| Field         | Type        | Nullable | Default  | Notes                                  |
| ------------- | ----------- | -------- | -------- | -------------------------------------- |
| id            | CUID        | No       | cuid()   | Primary key                            |
| email         | String      | Yes      | —        | Unique; optional for phone-only signup |
| emailVerified | DateTime    | Yes      | —        | Timestamp when email verified          |
| image         | String      | Yes      | —        | Profile picture URL                    |
| phone         | String      | Yes      | —        | Unique; mobile-first East Africa       |
| name          | String      | Yes      | —        | Display name                           |
| passwordHash  | String      | Yes      | —        | bcrypt hash or Auth.js managed         |
| role          | Role enum   | No       | CUSTOMER | CUSTOMER or ADMIN                      |
| country       | String      | Yes      | —        | ISO country code                       |
| locale        | Locale enum | No       | en       | en (English) or so (Somali)            |
| googleId      | String      | Yes      | —        | Google OAuth sub; unique               |
| createdAt     | DateTime    | No       | now()    | Account creation timestamp             |
| deletedAt     | DateTime    | Yes      | —        | Soft-delete timestamp (null = active)  |

**Primary Key:** id

**Foreign Keys:** None (root entity)

**Relationships:** 1:M to Account, Session, Address, Review, Cart, Wishlist, Order, WhatsappSession, InventoryLog, AuditLog

**Indexes:** `role` (filter by admin vs customer), `deletedAt` (filter active vs soft-deleted)

**Notes:**

- Email and phone are both optional and individually unique
- Enables phone-only registration (common in East Africa)
- locale determines UI language
- `deletedAt` implements the soft-delete workflow in docs/guidelines/privacy-and-data.md AC10/AC11/AC14: on self-service or admin-initiated account deletion, `email`/`phone`/`name` are nulled and `deletedAt` is set to the deletion timestamp; the row is hard-deleted after a 30-day grace period. Active-user queries should filter `WHERE deletedAt IS NULL` — see `ACTIVE_USER_FILTER` in `src/lib/user-deletion.ts`.

---

### Account

**Purpose:** Auth.js OAuth adapter linking user to OAuth provider (Google, GitHub, etc.).

| Field             | Type   | Nullable | Default |
| ----------------- | ------ | -------- | ------- |
| id                | CUID   | No       | cuid()  |
| userId            | FK     | No       | —       |
| type              | String | No       | —       |
| provider          | String | No       | —       |
| providerAccountId | String | No       | —       |
| refresh_token     | Text   | Yes      | —       |
| access_token      | Text   | Yes      | —       |
| expires_at        | Int    | Yes      | —       |
| token_type        | String | Yes      | —       |
| scope             | String | Yes      | —       |
| id_token          | Text   | Yes      | —       |
| session_state     | String | Yes      | —       |

**Keys:** PK: id | FK: userId CASCADE | **Unique:** (provider, providerAccountId)

**Note:** Field names (refresh_token, access_token) are snake_case per Auth.js; do not rename.

---

### Session

**Purpose:** Auth.js database session storage (when not using JWT).

| Field        | Type     | Nullable | Default |
| ------------ | -------- | -------- | ------- |
| id           | CUID     | No       | cuid()  |
| sessionToken | String   | No       | —       |
| userId       | FK       | No       | —       |
| expires      | DateTime | No       | —       |

**Keys:** PK: id | FK: userId CASCADE | **Unique:** sessionToken | **Index:** userId

---

### VerificationToken

**Purpose:** Email verification and password reset tokens (Auth.js adapter).

| Field      | Type     | Nullable | Default |
| ---------- | -------- | -------- | ------- |
| identifier | String   | No       | —       |
| token      | String   | No       | —       |
| expires    | DateTime | No       | —       |

**Keys:** Composite **Unique:** (identifier, token) — no surrogate id

**Note:** Auth.js strips any id column if present; composite unique satisfies Prisma's key requirement.

---

### Address

**Purpose:** Shipping and billing addresses for users, supporting multiple countries.

| Field        | Type             | Nullable | Default |
| ------------ | ---------------- | -------- | ------- |
| id           | CUID             | No       | cuid()  |
| userId       | FK               | No       | —       |
| fullName     | String           | No       | —       |
| phone        | String           | No       | —       |
| addressLine1 | String           | No       | —       |
| addressLine2 | String           | Yes      | —       |
| city         | String           | No       | —       |
| state        | String           | Yes      | —       |
| country      | CountryCode enum | No       | —       |
| isDefault    | Boolean          | No       | false   |

**Keys:** PK: id | FK: userId CASCADE | **Index:** userId

**Relationships:** 1:M to Order (orders shipped to this address)

**Notes:**

- country is enum (SO, KE, ET) for consistency
- state is optional (not always relevant in region)
- isDefault marks preferred shipping address

---

## Catalog (6 models)

### Category

**Purpose:** Product categories with multi-level hierarchy and bilingual names.

| Field     | Type    | Nullable | Default |
| --------- | ------- | -------- | ------- |
| id        | CUID    | No       | cuid()  |
| nameEn    | String  | No       | —       |
| nameSo    | String  | No       | —       |
| slug      | String  | No       | —       |
| parentId  | FK      | Yes      | —       |
| imageUrl  | String  | Yes      | —       |
| sortOrder | Int     | No       | 0       |
| isActive  | Boolean | No       | true    |

**Keys:** PK: id | FK: parentId SETNULL | **Unique:** slug | **Index:** parentId, isActive

**Relationships:** Self-join (parent/children), 1:M to Product

**Note:** Supports unlimited nesting depth; slug used in URLs.

---

### Product

**Purpose:** Catalog item with pricing, stock, media, and full-text search. IMMUTABLE prices after order placement.

| Field         | Type                  | Nullable | Default |
| ------------- | --------------------- | -------- | ------- |
| id            | CUID                  | No       | cuid()  |
| nameEn        | String                | No       | —       |
| nameSo        | String                | No       | —       |
| slug          | String                | No       | —       |
| descriptionEn | Text                  | Yes      | —       |
| descriptionSo | Text                  | Yes      | —       |
| brand         | String                | Yes      | —       |
| sku           | String                | No       | —       |
| basePriceUsd  | Decimal(10,2)         | No       | —       |
| stockQuantity | Int                   | No       | 0       |
| categoryId    | FK                    | No       | —       |
| isActive      | Boolean               | No       | true    |
| isFeatured    | Boolean               | No       | false   |
| createdAt     | DateTime              | No       | now()   |
| updatedAt     | DateTime              | No       | —       |
| searchVector  | Unsupported(tsvector) | Yes      | —       |

**Keys:** PK: id | FK: categoryId CASCADE | **Unique:** slug, sku | **Index:** categoryId, isActive, isFeatured | **GIN:** searchVector

**Notes:**

- IMMUTABLE: basePriceUsd locked for orders post-placement
- searchVector is GENERATED in Postgres; marked Unsupported in Prisma
- stockQuantity is SUM of InventoryLog deltas
- i18n: nameEn/So, descriptionEn/So

---

### ProductImage

**Purpose:** Product photos with bilingual alt text and positional ordering.

| Field     | Type    | Nullable | Default |
| --------- | ------- | -------- | ------- |
| id        | CUID    | No       | cuid()  |
| productId | FK      | No       | —       |
| url       | String  | No       | —       |
| altEn     | String  | Yes      | —       |
| altSo     | String  | Yes      | —       |
| position  | Int     | No       | 0       |
| isPrimary | Boolean | No       | false   |

**Keys:** PK: id | FK: productId CASCADE | **Unique:** (productId, position)

**Notes:**

- position determines display order in gallery
- isPrimary identifies thumbnail image

---

### ProductSpec

**Purpose:** Structured product specifications (key-value pairs).

| Field     | Type   | Nullable | Default |
| --------- | ------ | -------- | ------- |
| id        | CUID   | No       | cuid()  |
| productId | FK     | No       | —       |
| keyEn     | String | No       | —       |
| keySo     | String | No       | —       |
| valueEn   | String | No       | —       |
| valueSo   | String | No       | —       |
| sortOrder | Int    | No       | 0       |

**Keys:** PK: id | FK: productId CASCADE | **Index:** productId

**Note:** i18n: keyEn/So and valueEn/So for bilingual specs.

---

### ProductVariant

**Purpose:** Product variants (size, color, storage, etc.) with separate SKU and pricing.

| Field         | Type          | Nullable | Default |
| ------------- | ------------- | -------- | ------- |
| id            | CUID          | No       | cuid()  |
| productId     | FK            | No       | —       |
| name          | String        | No       | —       |
| sku           | String        | No       | —       |
| priceUsd      | Decimal(10,2) | No       | —       |
| stockQuantity | Int           | No       | 0       |
| attributes    | JSONB         | Yes      | —       |
| isActive      | Boolean       | No       | true    |

**Keys:** PK: id | FK: productId CASCADE | **Unique:** sku | **Index:** productId

**Notes:**

- attributes: structured JSON (e.g., {"color": "silver", "storage": "512GB"})
- priceUsd can differ from base product price
- stockQuantity per variant; sum of InventoryLog deltas

---

### Review

**Purpose:** Customer product reviews with ratings, supporting verified-purchase badges.

| Field              | Type     | Nullable | Default |
| ------------------ | -------- | -------- | ------- |
| id                 | CUID     | No       | cuid()  |
| productId          | FK       | No       | —       |
| userId             | FK       | No       | —       |
| rating             | SmallInt | No       | —       |
| title              | String   | Yes      | —       |
| body               | String   | Yes      | —       |
| isVerifiedPurchase | Boolean  | No       | false   |
| isApproved         | Boolean  | No       | false   |
| createdAt          | DateTime | No       | now()   |

**Keys:** PK: id | FK: productId CASCADE, userId CASCADE | **Unique:** (productId, userId) | **Index:** (productId, isApproved)

**Notes:**

- One review per customer per product
- isApproved controls display to other customers
- isVerifiedPurchase true if reviewer has completed order with product

---

## Shopping (4 models)

### Cart

**Purpose:** Shopping cart for authenticated users and guests.

| Field     | Type     | Nullable | Default |
| --------- | -------- | -------- | ------- |
| id        | CUID     | No       | cuid()  |
| userId    | FK       | Yes      | —       |
| sessionId | String   | Yes      | —       |
| createdAt | DateTime | No       | now()   |
| updatedAt | DateTime | No       | —       |

**Keys:** PK: id | FK: userId CASCADE (optional) | **Index:** userId, sessionId

**Notes:**

- Guest carts: userId=null, sessionId present
- Merge guest cart into user cart on sign-in

---

### CartItem

**Purpose:** Individual item in cart, supporting variants.

| Field     | Type | Nullable | Default |
| --------- | ---- | -------- | ------- |
| id        | CUID | No       | cuid()  |
| cartId    | FK   | No       | —       |
| productId | FK   | No       | —       |
| variantId | FK   | Yes      | —       |
| quantity  | Int  | No       | 1       |

**Keys:** PK: id | FK: cartId CASCADE, productId CASCADE, variantId SETNULL | **Index:** cartId, productId

**Note:** variantId optional; if null, base product used.

---

### Wishlist

**Purpose:** Saved items for later purchase.

| Field     | Type     | Nullable | Default |
| --------- | -------- | -------- | ------- |
| id        | CUID     | No       | cuid()  |
| userId    | FK       | No       | —       |
| productId | FK       | No       | —       |
| createdAt | DateTime | No       | now()   |

**Keys:** PK: id | FK: userId CASCADE, productId CASCADE | **Unique:** (userId, productId) | **Index:** userId

**Note:** One wish per product per user.

---

## Commerce (7 models)

### Coupon

**Purpose:** Promotional discount codes (percent or fixed amount).

| Field       | Type            | Nullable | Default |
| ----------- | --------------- | -------- | ------- |
| id          | CUID            | No       | cuid()  |
| code        | String          | No       | —       |
| type        | CouponType enum | No       | —       |
| value       | Decimal(10,2)   | No       | —       |
| minOrderUsd | Decimal(10,2)   | Yes      | —       |
| maxUses     | Int             | Yes      | —       |
| usedCount   | Int             | No       | 0       |
| expiresAt   | DateTime        | Yes      | —       |
| isActive    | Boolean         | No       | true    |

**Keys:** PK: id | **Unique:** code

**Notes:**

- type=PERCENT: value is 20 for 20%
- type=FIXED: value is 10.00 for $10 USD
- maxUses: null = unlimited; usedCount <= maxUses enforced at app layer
- expiresAt: null = no expiry

---

### Order

**Purpose:** Customer order with IMMUTABLE pricing snapshots.

| Field             | Type               | Nullable | Default |
| ----------------- | ------------------ | -------- | ------- |
| id                | CUID               | No       | cuid()  |
| userId            | FK                 | Yes      | —       |
| status            | OrderStatus enum   | No       | PLACED  |
| subtotalUsd       | Decimal(10,2)      | No       | —       |
| discountUsd       | Decimal(10,2)      | No       | 0       |
| taxUsd            | Decimal(10,2)      | No       | 0       |
| totalUsd          | Decimal(10,2)      | No       | —       |
| chargeCurrency    | Currency enum      | No       | —       |
| chargeAmount      | Decimal(12,2)      | No       | —       |
| fxRate            | Decimal(14,6)      | Yes      | —       |
| fxRateAt          | DateTime           | Yes      | —       |
| shippingAddressId | FK                 | Yes      | —       |
| couponId          | FK                 | Yes      | —       |
| paymentMethod     | PaymentMethod enum | Yes      | —       |
| paymentStatus     | PaymentStatus enum | Yes      | PENDING |
| isWhatsappOrder   | Boolean            | No       | false   |
| notes             | String             | Yes      | —       |
| createdAt         | DateTime           | No       | now()   |

**Keys:** PK: id | FK: userId/shippingAddressId/couponId SETNULL | **Index:** userId, status, createdAt

**CRITICAL:** subtotalUsd, discountUsd, taxUsd, totalUsd are IMMUTABLE after placement.

**Notes:**

- SETNULL on FK deletion preserves order history
- fxRate and fxRateAt lock currency conversion at checkout
- Precision: 10,2 for USD; 12,2 for KES in chargeAmount

---

### OrderItem

**Purpose:** IMMUTABLE line item with price and name snapshots.

| Field          | Type          | Nullable | Default |
| -------------- | ------------- | -------- | ------- |
| id             | CUID          | No       | cuid()  |
| orderId        | FK            | No       | —       |
| productId      | FK            | Yes      | —       |
| variantId      | FK            | Yes      | —       |
| quantity       | Int           | No       | —       |
| unitPriceUsd   | Decimal(10,2) | No       | —       |
| nameSnapshotEn | String        | No       | —       |
| nameSnapshotSo | String        | No       | —       |

**Keys:** PK: id | FK: orderId CASCADE, productId/variantId SETNULL | **Index:** orderId, productId

**CRITICAL:** All fields IMMUTABLE. Never update or delete. Snapshots preserve historical accuracy.

---

### Payment

**Purpose:** Payment transaction per gateway, supporting idempotent retries.

| Field                | Type                | Nullable | Default |
| -------------------- | ------------------- | -------- | ------- |
| id                   | CUID                | No       | cuid()  |
| orderId              | FK                  | No       | —       |
| gateway              | PaymentGateway enum | No       | —       |
| method               | PaymentMethod enum  | No       | —       |
| gatewayReference     | String              | No       | —       |
| gatewayTransactionId | String              | Yes      | —       |
| amountUsd            | Decimal(10,2)       | No       | —       |
| chargeAmount         | Decimal(12,2)       | No       | —       |
| chargeCurrency       | Currency enum       | No       | —       |
| status               | PaymentStatus enum  | No       | PENDING |
| callbackPayload      | JSONB               | Yes      | —       |
| lastPolledAt         | DateTime            | Yes      | —       |
| pollAttempts         | Int                 | No       | 0       |
| createdAt            | DateTime            | No       | now()   |

**Keys:** PK: id | FK: orderId CASCADE | **Unique:** (gateway, gatewayReference) | **Index:** orderId, status

**Notes:**

- Idempotent via gatewayReference
- Multiple Payment records possible per Order (retries)
- Order.paymentStatus reflects latest attempt

---

### FxRate

**Purpose:** Exchange rate cache (USD to KES) for checkout.

| Field     | Type          | Nullable | Default |
| --------- | ------------- | -------- | ------- |
| id        | CUID          | No       | cuid()  |
| base      | FxBase enum   | No       | USD     |
| quote     | FxQuote enum  | No       | KES     |
| rate      | Decimal(14,6) | No       | —       |
| spreadPct | Decimal(5,3)  | No       | —       |
| source    | String        | No       | —       |
| fetchedAt | DateTime      | No       | now()   |

**Keys:** PK: id | **Index:** (base, quote, fetchedAt)

**Notes:**

- Decimal(14,6) for precision (basis points)
- spreadPct is markup (e.g., 2.500 for 2.5%)
- source: "fixer.io", "exchangerate-api", "manual"

---

## Operations (3 models)

### WhatsappSession

**Purpose:** WhatsApp Business conversation state for order creation and support.

| Field         | Type     | Nullable | Default |
| ------------- | -------- | -------- | ------- |
| id            | CUID     | No       | cuid()  |
| waPhoneId     | String   | No       | —       |
| fromPhone     | String   | No       | —       |
| userId        | FK       | Yes      | —       |
| orderId       | FK       | Yes      | —       |
| state         | String   | No       | —       |
| context       | JSONB    | Yes      | —       |
| lastMessageAt | DateTime | No       | now()   |
| createdAt     | DateTime | No       | now()   |

**Keys:** PK: id | FK: userId/orderId SETNULL | **Index:** fromPhone, userId

**Notes:**

- state: state machine (e.g., "awaiting-payment")
- context: structured conversation data

---

### InventoryLog

**Purpose:** APPEND-ONLY ledger of signed inventory deltas.

| Field     | Type     | Nullable | Default |
| --------- | -------- | -------- | ------- |
| id        | CUID     | No       | cuid()  |
| productId | FK       | No       | —       |
| variantId | FK       | Yes      | —       |
| delta     | Int      | No       | —       |
| reason    | String   | No       | —       |
| createdBy | FK       | Yes      | —       |
| createdAt | DateTime | No       | now()   |

**Keys:** PK: id | FK: productId CASCADE, variantId/createdBy SETNULL | **Index:** productId, createdAt

**APPEND-ONLY:** Current stock = SUM(delta). Never update/delete; record corrections as new deltas.

---

### AuditLog

**Purpose:** APPEND-ONLY audit trail for sensitive actions.

| Field         | Type     | Nullable | Default |
| ------------- | -------- | -------- | ------- |
| id            | CUID     | No       | cuid()  |
| actorId       | FK       | Yes      | —       |
| action        | String   | No       | —       |
| entityType    | String   | No       | —       |
| entityId      | String   | No       | —       |
| before        | JSONB    | Yes      | —       |
| after         | JSONB    | Yes      | —       |
| reason        | String   | Yes      | —       |
| correlationId | String   | Yes      | —       |
| createdAt     | DateTime | No       | now()   |

**Keys:** PK: id | FK: actorId SETNULL | **Index:** (entityType, entityId), actorId, createdAt

**APPEND-ONLY:** Database trigger enforces write-only. Application writes via src/lib/audit.ts.

---

## Summary

**Total models:** 22 | **Total FKs:** 25+ | **Total indexes:** 30+ | **Total enums:** 11

All models documented with fields, keys, relationships, constraints. See 02-ENUMS.md, 03-PATTERNS.md, 04-ER-DIAGRAM.md for additional details.
