# Architecture — Sprint 2 (as built)

This supersedes the Sprint 1 sketch (`docs/sprint-1/architecture.md`) with what actually
got built. See [Deviations from the Sprint 1 sketch](#deviations-from-the-sprint-1-sketch)
for what changed and why.

## Overview

DropShelf is a single Next.js app (App Router) with no separate backend server. UI
rendering, the checkout server action, and the Stripe webhook receiver all live in one
project under `prototype/`. There is no database yet — creator and product data is a
hardcoded in-memory module. Stripe is the only external service and is the source of
truth for payment and checkout-session state.

## Major Components

**Client — pages and components (`app/`, `components/`)**

- `app/page.tsx` — the storefront. Server component that reads `creator` and `products`
  from `lib/data.ts` and renders `CreatorProfile` + a grid of `ProductCard`.
- `components/creator-profile.tsx` — renders the creator's name, bio, and image.
- `components/product-card.tsx` — renders a product and a "Buy" `<form>` whose `action`
  is the `createCheckoutSession` server action, bound to that product's id
  (`createCheckoutSession.bind(null, product.id)`). No client-side JavaScript is
  required to initiate checkout.
- `app/checkout/success/page.tsx` — the post-purchase confirmation page. Server
  component; see below.

**Server — server action + API route (`lib/`, `app/api/`)**

- `lib/actions.ts` (`"use server"`) — `createCheckoutSession(productId)`: looks up the
  product via `getProductById`, throws on an unknown id, builds a single-line-item
  Stripe Checkout Session (`mode: "payment"`, inline `price_data`, no pre-created Stripe
  Price objects), and `redirect()`s the browser to the returned hosted Checkout URL.
  Runs entirely server-side — the Stripe secret key never reaches the client.
- `app/api/webhooks/stripe/route.ts` — `POST` handler. Reads the raw request body,
  requires both a `stripe-signature` header and `STRIPE_WEBHOOK_SECRET`; verifies the
  event with `stripe.webhooks.constructEvent`. Returns `400` if the signature/secret is
  missing or verification fails, so nothing is trusted from an unverified payload. On a
  verified `checkout.session.completed` event it currently only logs the session id
  (`console.log`) — no order record is persisted (see deviations below).
- `lib/stripe.ts` — single `Stripe` client instance constructed from
  `STRIPE_SECRET_KEY`; throws at import time if the key is missing.

**Route table**

| Method | Route | Handler | Purpose |
|---|---|---|---|
| GET | `/` | `app/page.tsx` | Storefront: profile + product grid |
| POST (server action) | — | `lib/actions.ts: createCheckoutSession` | Create a Stripe Checkout Session, redirect to Stripe |
| GET | `/checkout/success?session_id=` | `app/checkout/success/page.tsx` | Re-verify payment against Stripe, show confirmation |
| POST | `/api/webhooks/stripe` | `app/api/webhooks/stripe/route.ts` | Verify + receive Stripe webhook events |

**Data**

- `lib/data.ts` — hardcoded in-memory `creator: Creator` object and `products: Product[]`
  array (id, title, description, price in cents, image URL), plus `getProductById`.
  There is no database in Sprint 2 — this is a deliberate scope cut from the Sprint 1
  sketch (see below).
- `lib/utils.ts` — `formatPrice` (cents → display currency string) and `getBaseUrl`
  (resolves the app's own base URL for building Stripe success/cancel URLs).
- Stripe itself is the persistence layer for payment/session state: the app never
  stores card data or payment status locally — `app/checkout/success/page.tsx` always
  re-fetches the session from Stripe (`stripe.checkout.sessions.retrieve`) and checks
  `payment_status === "paid"` rather than trusting the redirect URL.

## Data Flow

1. Buyer loads `/` → `app/page.tsx` reads `creator`/`products` from `lib/data.ts` and
   renders the storefront.
2. Buyer submits a product's "Buy" form → `createCheckoutSession(productId)` runs on
   the server, looks up the product, creates a Stripe Checkout Session, and redirects
   the buyer to Stripe's hosted checkout page.
3. Buyer pays on Stripe's hosted page with a test card.
4. Stripe redirects the buyer back to `/checkout/success?session_id=...`. That page
   independently retrieves the session from Stripe and renders "Order confirmed" only
   if `payment_status === "paid"`.
5. In parallel, Stripe sends a `checkout.session.completed` event to
   `/api/webhooks/stripe`. The route verifies the signature and logs the event.

## Deviations from the Sprint 1 sketch

The Sprint 1 architecture doc (`docs/sprint-1/architecture.md`) sketched a more general
multi-creator system. Building the actual slice narrowed that scope:

- **No database.** Sprint 1 planned Postgres (or SQLite for dev) for creator/product
  data. Sprint 2 hardcodes a single creator and three products in `lib/data.ts` instead.
  Persistence is deferred to Sprint 3.
- **No per-creator dynamic routes.** The sketch proposed `/[creator]` and
  `/[creator]/[product]`. Sprint 2 ships one hardcoded storefront at `/` — there is only
  ever one creator in this prototype, so dynamic routing was cut as unnecessary scope.
- **No admin UI.** Creator/product data is edited directly in `lib/data.ts` source, not
  through an admin interface.
- **Webhook events are logged, not persisted.** The route verifies and logs
  `checkout.session.completed` but does not write an order record anywhere — there is
  nowhere to write one without a database. Flagged as a known gap, not an oversight.
- **Added, not in the original sketch:** the `/checkout/success` server-side
  re-verification step and the dedicated Stripe webhook route with signature
  verification. Sprint 1 only asked "does Sprint 1 need webhooks?" as an open question;
  Sprint 2 answered yes and required signature verification before trusting any event.

## Open Questions (carried into Sprint 3)

- Which database replaces `lib/data.ts` — hosted Postgres vs. a lighter option — and
  what's the migration path for the existing hardcoded records?
- Should the webhook handler persist an `orders` table row on
  `checkout.session.completed`, and what fields does that record need?
- Does multi-creator support (dynamic `[creator]` routing) belong in Sprint 3, or stay
  out of scope for the whole prototype?
