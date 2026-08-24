# Enum Reference: All 11 Types

Complete enumeration values for all type-safe enums in the HurbadHardware schema.

---

## Role

**Purpose:** User role for authorization and admin access.

| Value    | Meaning                                         |
| -------- | ----------------------------------------------- |
| CUSTOMER | Regular customer account                        |
| ADMIN    | Administrator with access to sensitive features |

**Usage:** `User.role`

---

## Locale

**Purpose:** User's preferred language.

| Value | Meaning |
| ----- | ------- |
| en    | English |
| so    | Somali  |

**Usage:** `User.locale`, controls language for UI and order snapshots.

---

## CountryCode

**Purpose:** ISO country code for regional support.

| Value | Meaning  |
| ----- | -------- |
| SO    | Somalia  |
| KE    | Kenya    |
| ET    | Ethiopia |

**Usage:** `Address.country`, `FxRate` rules, shipping zones.

---

## CouponType

**Purpose:** Discount type for promotional coupons.

| Value   | Meaning                             |
| ------- | ----------------------------------- |
| PERCENT | Percentage discount (e.g., 20% off) |
| FIXED   | Fixed USD amount (e.g., $10 off)    |

**Usage:** `Coupon.type` — determines how `Coupon.value` is interpreted.

---

## OrderStatus

**Purpose:** Order lifecycle state machine.

| Value      | Meaning                                     |
| ---------- | ------------------------------------------- |
| PLACED     | Order created, awaiting payment/fulfillment |
| PROCESSING | Payment confirmed, being packed             |
| SHIPPED    | Handed off to courier                       |
| DELIVERED  | Delivered to customer                       |
| CANCELLED  | Order cancelled                             |

**Usage:** `Order.status` — transitions: PLACED → PROCESSING → SHIPPED → DELIVERED or CANCELLED at any point.

---

## Currency

**Purpose:** Supported transaction currencies.

| Value | Meaning                                  |
| ----- | ---------------------------------------- |
| USD   | US Dollar (primary currency for pricing) |
| KES   | Kenyan Shilling (regional currency)      |

**Usage:** `Order.chargeCurrency`, `Payment.chargeCurrency`, `FxRate` conversions.

---

## PaymentGateway

**Purpose:** Payment service provider.

| Value    | Meaning                                 |
| -------- | --------------------------------------- |
| WAAFIPAY | WaafiPay (Somali payment processor)     |
| EDAHAB   | eDahab (Money transfer service)         |
| PAYSTACK | Paystack (Pan-African payment platform) |

**Usage:** `Payment.gateway` — identifies which provider processed the transaction.

---

## PaymentMethod

**Purpose:** Customer's payment mechanism.

| Value    | Meaning                              |
| -------- | ------------------------------------ |
| EVC_PLUS | EVC Plus mobile wallet (Somalia)     |
| EDAHAB   | eDahab money transfer                |
| CARD     | Credit/debit card (Visa, Mastercard) |
| MPESA    | M-Pesa mobile money (Kenya)          |

**Usage:** `Order.paymentMethod`, `Payment.method` — indicates how customer paid.

---

## PaymentStatus

**Purpose:** Payment transaction state.

| Value     | Meaning                                                         |
| --------- | --------------------------------------------------------------- |
| PENDING   | Awaiting confirmation from payment gateway                      |
| COMPLETED | Payment successful; funds received or guaranteed                |
| FAILED    | Payment attempt failed (invalid card, insufficient funds, etc.) |
| EXPIRED   | Payment session expired (customer abandoned checkout)           |

**Usage:** `Order.paymentStatus`, `Payment.status` — reflects most recent transaction status.

---

## FxBase

**Purpose:** Base currency for exchange rates (source currency).

| Value | Meaning                         |
| ----- | ------------------------------- |
| USD   | US Dollar (the only base in v1) |

**Usage:** `FxRate.base` — always USD in current implementation.

---

## FxQuote

**Purpose:** Quote currency for exchange rates (target currency).

| Value | Meaning                                |
| ----- | -------------------------------------- |
| KES   | Kenyan Shilling (the only quote in v1) |

**Usage:** `FxRate.quote` — always KES in current implementation.

---

## Summary

**Total enums:** 11  
**Total enum values:** 38  
**Key patterns:**

- Language: Locale (en, so)
- Geography: CountryCode (SO, KE, ET)
- Money: Currency (USD, KES), CouponType (PERCENT, FIXED)
- Commerce: OrderStatus (5 states), PaymentStatus (4 states), PaymentGateway (3 providers), PaymentMethod (4 methods)
- Exchange: FxBase (USD), FxQuote (KES)
- Admin: Role (CUSTOMER, ADMIN)

All enums are stored as lowercase in Postgres (via @map); Prisma Client uses PascalCase.
