# Privacy & Data-Minimization Guidelines

**Context:** This document specifies data collection, retention, deletion workflows, and privacy practices for HurbadHardware. This is GDPR-inspired guidance for operational data handling; it is NOT a legal compliance guarantee.

---

## AC8: Data Inventory

HurbadHardware collects and stores the following categories of data:

### Customer Profile Data

- Email address (login credential; PII)
- Password hash (bcrypt, never plaintext)
- Full name (PII)
- Phone number (PII)
- Shipping address (PII)
- Billing address (PII)
- Locale preference (non-sensitive)
- Role (customer, admin)
- Account creation timestamp
- Last login timestamp
- Account deletion marker (soft-delete flag)

### Order Data

- Order ID
- Customer ID (foreign key)
- Order timestamp
- Items ordered (product name, SKU, quantity, price at time of order)
- Total amount (including shipping, tax, discounts)
- Order status (pending, confirmed, shipped, delivered, cancelled, refunded)
- Shipping address (copy at time of order; PII)
- Tracking number
- Delivery date
- Audit records (who modified, when, why)

### Payment Data

- Payment ID
- Order ID (foreign key)
- Customer ID (foreign key)
- Payment gateway (M-Pesa, eDahab, WaafiPay, etc.)
- Transaction ID from gateway (for reconciliation)
- Amount charged
- Currency
- Payment status (pending, completed, failed, refunded)
- Customer name (PII; copy from order)
- Customer email (PII; copy from order)
- Last 4 digits of payment method (masked card/account)
- Payment timestamp
- Idempotency key (for replay detection)

### Analytics & Session Data

- Session token (JWT)
- Session creation timestamp
- Session expiration timestamp
- Correlation ID (request tracing)
- User agent
- Source IP address
- Referrer URL
- Page/endpoint accessed
- Timestamp

### Audit Logs

- Actor ID (user who performed action)
- Action (create, update, delete, override)
- Entity type (product, order, user, payment)
- Entity ID
- Before snapshot (optional; PII included for completeness)
- After snapshot (optional; PII included for completeness)
- Reason (for overrides)
- Timestamp
- Correlation ID

### Cookies

- Session ID (HttpOnly, Secure, SameSite=Lax)
- Locale preference (language code: en, so)
- CSRF token (if applicable)
- Tracking/analytics cookies (if enabled; gated by consent)

---

## AC9: Sensitive Fields (PII) & Handling Rules

| Field                  | Type          | Collection                    | Handling Rule                                            |
| ---------------------- | ------------- | ----------------------------- | -------------------------------------------------------- |
| Email address          | PII           | Registration, login, checkout | Hash for auth; mask in logs; never log plaintext         |
| Password               | Secret        | Registration, login           | Hash only (bcrypt); never store plaintext                |
| Full name              | PII           | Order shipping/billing        | Include in audit; mask in logs                           |
| Phone number           | PII           | Profile, checkout             | Include in audit; mask in logs (last 4 digits)           |
| Address                | PII           | Profile, checkout             | Include in audit; do not log to structured logs          |
| Payment method         | Sensitive     | Checkout                      | Store only last 4 digits + type; never store full PAN    |
| Gateway transaction ID | Non-sensitive | Payment reconciliation        | Log and audit freely; non-PII; needed for reconciliation |
| Correlation ID         | Non-sensitive | All requests                  | Log and audit freely; for tracing; non-PII               |

---

## AC10: Data Retention Windows

| Data Category           | Retention Window            | Action After Window                                           |
| ----------------------- | --------------------------- | ------------------------------------------------------------- |
| Active customer profile | Indefinite (until deletion) | Soft-delete: anonymize email, name, phone, address            |
| Soft-deleted customer   | 30 days                     | Hard-delete after grace period                                |
| Order records           | 7 years                     | Preserve with anonymized customer data                        |
| Payment records         | 7 years                     | Preserve with anonymized customer data; retain transaction ID |
| Audit logs              | 2 years                     | Hard-delete after 2 years                                     |
| Session tokens          | 30 days or logout           | Invalidate on logout; auto-expire after 30 days               |
| Temporary cookies       | Per consent                 | Delete on opt-out or 1 year (whichever sooner)                |
| Correlation IDs in logs | 90 days                     | Purge from log archive after 90 days                          |

---

## AC11: Deletion Workflows

### Soft-Delete (User-Initiated Account Deletion)

1. Create audit entry: { action: 'user.delete', reason: 'Customer-initiated deletion' }
2. Anonymize PII: email -> null, name -> null, phone -> null, address -> null
3. Set User.deletedAt = NOW()
4. Orders and Payments are NOT deleted; customer data within them is anonymized
5. Revoke all active session tokens
   > **Known limitation:** `softDeleteUser()` currently only deletes DB-tracked
   > `sessions` rows (OAuth account-linking bookkeeping). Because this app runs
   > `session.strategy: "jwt"`, that has no effect on already-issued JWT
   > session cookies — a deleted user's active session is not immediately
   > terminated and instead expires naturally within the JWT `maxAge` window.
   > True immediate revocation requires a DB re-check in the NextAuth `jwt`/
   > `session` callback, or switching to `session.strategy: "database"`. See
   > `src/lib/user-deletion.ts`.
6. Retain User row for 30 days (grace period for recovery)

### Hard-Delete (After Retention Window)

- Orders & Payments: Hard-delete after 7 years (legal hold)
- Audit logs: Hard-delete after 2 years
- User profile: Hard-delete after 30-day grace period (if no recovery requested)

---

## AC12: Data Minimization (Operational Definition)

Data minimization is defined as:

**"Collect and retain only data required for a documented business purpose. Do not retain beyond that purpose's duration."**

Application:

1. Collection: Every data field must have a documented reason (email for login, phone for shipping, etc.)
2. Retention: Every record must have a documented retention reason and window
3. Visibility: Every query selects only required columns (no SELECT *)

---

## AC13: Privacy Policy & Consent

### Privacy Policy Location

A public privacy policy must be published and must reference:

- Data inventory (AC8)
- Sensitive fields and handling (AC9)
- Retention windows (AC10)
- Deletion/anonymization workflows (AC11)
- Consent requirements (cookies, marketing)

### Consent Policies (PRD §0.6)

1. Essential Cookies: Session token (required; no consent needed)
2. Analytics Cookies: Tracking and analytics (consent required; off by default)
3. Marketing Cookies: Re-targeting, newsletters (consent required; off by default)

Consent status is stored per user.

---

## AC14: Account Deletion Workflow

### Self-Service Deletion

1. Confirmation step: User enters password to confirm intent
2. Soft-delete: Anonymize PII and set deletedAt timestamp
3. Email confirmation: Send to old address: "Your account has been deleted. Recover within 30 days by contacting support."
4. Grace period: 30-day window for recovery
5. Hard-delete: After 30 days, row is hard-deleted; recovery no longer possible

### Admin-Initiated Deletion

1. Reason required: Admin provides reason (abuse, GDPR request, etc.)
2. Audit entry: Action logged with reason
3. Same soft-delete process: Email, phone, name, address -> null; deletedAt set
4. Grace period: Still 30 days for recovery
5. Hard-delete: After 30 days, automatic hard-delete

### GDPR Data Subject Access Request (DSAR)

1. Scope: Email, profile, orders, payments, sessions, audit entries
2. Format: Return as JSON export
3. Timeline: Respond within 30 days
4. Method: Manual process (coordinate with ops team)

---

## Compliance Notes

**This is NOT a legal compliance guarantee.** Before production launch, please:

1. Have a lawyer review this document
2. Publish a formal Privacy Policy
3. Ensure all consent mechanisms are functional
4. Test data deletion workflows with legal team

---

## Related Documents

- PRD Section 0.6: Consent and privacy requirements
- docs/API-STANDARDS.md: PII redaction in APIs
- docs/guidelines/rate-limiting.md: PII in rate-limit logs
- src/lib/redact.ts: Utility for PII redaction in code
