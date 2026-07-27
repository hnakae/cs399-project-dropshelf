# Architecture — Sprint 3 (as built)

This supersedes `docs/sprint-2-prototype/architecture.md` with what actually got built
in Sprint 3: a real persistence layer. See
[Deviations from Sprint 2](#deviations-from-sprint-2) for what changed and why.

> **Follow-up work after this doc was first written** (webhook atomic-write fix, the
> `/orders` view, and its access-control gate) is documented individually in
> `updates/` and folded into the sections below rather than duplicated here.

## Overview

DropShelf is still a single Next.js app (App Router) with no separate backend server.
What changed this sprint: there is now a real database. Product data and order history
are durable Postgres rows instead of a hardcoded module and a `console.log`. Stripe
remains the source of truth for payment/checkout-session state and the only external
service; the database is the source of truth for the product catalog and for order
history.

## Major Components

**Database (`lib/db/`)**

- `lib/db/schema.ts` — Drizzle schema, three tables:
  - `products` — `id` (text, primary key, e.g. `"tide-mug"`), `title`, `description`,
    `price_in_cents`, `image_url`. Replaces the hardcoded array previously in
    `lib/data.ts`.
  - `orders` — `id` (serial), `stripe_checkout_session_id` (text, unique), `status`,
    `customer_email`, `amount_total_in_cents`, `created_at`.
  - `order_items` — `id` (serial), `order_id` (FK → `orders.id`), `product_id`
    (FK → `products.id`), `quantity`, `unit_price_in_cents`.
  - One order has many order items; each order item references exactly one product.
    This is the same one-to-many-plus-reference shape as a classic invoice/line-item
    schema — a deliberately ordinary relational design, not a clever one.
- `lib/db/index.ts` — `getDb()`, a lazily-constructed Drizzle client over
  `@neondatabase/serverless`'s HTTP driver. Lazy on purpose: `next build` evaluates
  top-level module code, and constructing the Neon client eagerly would crash the build
  on the first deploy before `DATABASE_URL` exists.
- `lib/db/seed.ts` — idempotent seed script (`onConflictDoUpdate`) that loads the three
  original hardcoded products into the `products` table. Run via `npm run db:seed`.
- Provisioning: Postgres via Neon, installed through the Vercel Marketplace
  (`vercel integration add neon`) rather than a self-hosted or manually-provisioned
  database — this auto-injects `DATABASE_URL` and related env vars into the linked
  Vercel project and `.env.local` via `vercel env pull`.

**Client — pages and components (`app/`, `components/`)**

- `app/page.tsx` — the storefront. Now an `async` server component: reads `creator`
  (still hardcoded — see deviations) and calls `await getProducts()`, which queries the
  database, instead of importing a static array.
- `components/creator-profile.tsx`, `components/product-card.tsx` — unchanged from
  Sprint 2; still render whatever `Product`/`Creator` objects they're given, now sourced
  from the database instead of a module constant.
- `app/checkout/success/page.tsx` — unchanged. Still re-verifies against Stripe
  directly rather than reading the database; see deviations for why this was left alone.
- `app/orders/page.tsx` — **new.** An `async` server component that calls
  `await getOrders()` and renders every persisted order with its line items — the
  order-history UI originally listed as an open question below. Explicitly
  `export const dynamic = "force-dynamic"` so it queries Postgres on every request
  instead of prerendering a build-time snapshot (order data changes on every checkout,
  unlike the product catalog). Gated by `proxy.ts` (see below). Full detail:
  `updates/orders-view.md`.
- `components/nav.tsx` — **new.** Site-wide nav rendered from `app/layout.tsx`, linking
  `/` and `/orders`.

**Server — server action + API route (`lib/`, `app/api/`)**

- `lib/actions.ts` (`"use server"`) — `createCheckoutSession(productId)` now
  `await`s `getProductById` (database-backed) instead of a synchronous array lookup,
  and adds `metadata: { productId, quantity, unitPriceInCents }` to the Stripe Checkout
  Session. That metadata is what lets the webhook, below, know *what was actually
  bought* without a second Stripe API call.
- `app/api/webhooks/stripe/route.ts` — on a verified `checkout.session.completed`
  event, `recordOrder()` now:
  1. Reads `productId` / `quantity` / `unitPriceInCents` from the session's metadata;
     logs an error and returns without writing anything if that metadata is missing.
  2. Writes the `orders` row and its `order_items` row in a **single parameterized SQL
     statement** (a `WITH ... AS (INSERT ... RETURNING id) INSERT ... SELECT FROM`
     CTE), not two separate `db.insert()` calls — `drizzle-orm/neon-http` doesn't
     support `db.transaction()`, so atomicity comes from it being one Postgres
     statement instead. `ON CONFLICT (stripe_checkout_session_id) DO NOTHING` on the
     `orders` insert still makes a redelivered webhook a complete no-op: an empty CTE
     means the `order_items` insert also produces nothing. Full detail and the
     transaction-vs-single-statement reasoning: `updates/webhook-atomic-write.md`.
- `lib/stripe.ts` — unchanged.
- `proxy.ts` — **new.** Gates `/orders` with HTTP Basic Auth checked against
  `ORDERS_VIEW_PASSWORD`. This Next.js version (16.2.9) renamed the `middleware.ts`
  file convention to `proxy.ts` as of v16.0.0; the build output confirms it
  (`ƒ Proxy (Middleware)`). Full reasoning, including why a shared-secret gate was
  chosen over standing up Clerk: `updates/orders-view-auth-gate.md`.

**Route table**

One new route this update: `/orders`. Otherwise unchanged from Sprint 2 — the storefront
routes read from and write to Postgres instead of an in-memory module.

| Method | Route | Handler | Purpose |
|---|---|---|---|
| GET | `/` | `app/page.tsx` | Storefront: profile + product grid, now DB-backed |
| POST (server action) | — | `lib/actions.ts: createCheckoutSession` | Create a Stripe Checkout Session (DB product lookup), redirect to Stripe |
| GET | `/checkout/success?session_id=` | `app/checkout/success/page.tsx` | Re-verify payment against Stripe, show confirmation |
| POST | `/api/webhooks/stripe` | `app/api/webhooks/stripe/route.ts` | Verify event, persist order + order item to Postgres (single atomic statement) |
| GET | `/orders` | `app/orders/page.tsx` | Order history, read from Postgres on every request; gated by `proxy.ts` |

## Data Flow

1. Buyer loads `/` → `app/page.tsx` calls `getProducts()`, which queries the `products`
   table, and renders the storefront.
2. Buyer submits a product's "Buy" form → `createCheckoutSession(productId)` runs on
   the server, looks up the product in the database, creates a Stripe Checkout Session
   carrying that product's id/quantity/price in `metadata`, and redirects the buyer to
   Stripe's hosted checkout page.
3. Buyer pays on Stripe's hosted page with a test card.
4. Stripe redirects the buyer back to `/checkout/success?session_id=...`, which
   independently re-verifies against Stripe and shows "Order confirmed" — this path is
   unchanged and still doesn't touch the database.
5. In parallel (and asynchronously — there's no guaranteed ordering between steps 4 and
   5), Stripe sends `checkout.session.completed` to `/api/webhooks/stripe`. The route
   verifies the signature, then writes the `orders` and `order_items` rows. This is now
   the only place order history is durably recorded.

## Why SQL, and why Drizzle

Both choices are documented in more depth in `docs/sprint-3-persistence/notes.md` (raw
working notes) and `ai-implementation-review.md` (the final reasoning and what I
directed vs. accepted); summarized here:

- **SQL over NoSQL:** the data is genuinely relational — an order has many items, each
  item references a product — which is the textbook case for foreign keys and joins.
  A document store would mean either duplicating product data into every order document
  or reimplementing joins by hand. Not a close call for this schema.
- **Drizzle over Prisma:** both are viable; Drizzle was chosen because its schema is
  plain TypeScript (no separate DSL file, no `prisma generate` codegen step) and maps
  closely to the actual SQL it produces, which made it easier to explain and reason
  about directly. Prisma's `@relation` syntax is arguably more explicit for
  demonstrating relational understanding to a reviewer, and remains a reasonable
  alternative if that tradeoff mattered more here.

## Deviations from Sprint 2

The Sprint 2 architecture doc listed "which database" and "should the webhook persist
an order" as open questions for Sprint 3. Both are now answered (above). What's still
deliberately unchanged:

- **`creator` is still a hardcoded object in `lib/data.ts`.** Only `products` and
  orders moved to the database. There's one creator, it doesn't get written to, and
  giving it a table wouldn't demonstrate anything relational — not worth the scope this
  sprint. Genuinely open for a future sprint if multi-creator support ever happens.
- **`/checkout/success` still doesn't read the database.** It re-verifies the payment
  directly against Stripe, which is independent of whether the webhook has run yet
  (webhook delivery is asynchronous and not guaranteed to complete before the buyer's
  browser redirect does). Reading the order back from Postgres here would require
  handling the case where the webhook hasn't landed yet — deferred rather than solved
  under time pressure.
- **No order-history UI — resolved as a follow-up.** `/orders` now exists (see above
  and `updates/orders-view.md`); this is no longer an open gap.

## Open Questions (carried into Sprint 4)

- Should `/checkout/success` read the order back from the database (with a fallback or
  retry for the case where the webhook hasn't landed yet), instead of only re-checking
  Stripe?
- The known Sprint 2 gap — `/checkout/success` throws an unhandled 500 on an invalid or
  expired `session_id` — is still unfixed; it's independent of persistence and was not
  in scope this sprint.
- `/orders` has no automated test coverage yet (`updates/orders-view.md`) — worth a
  Sprint 4 pass.
- `/orders` is gated by a shared-secret `proxy.ts` check, not real auth — acceptable for
  a single internal page this sprint, but should be replaced by real auth (Clerk being
  the leading candidate — see `updates/orders-view-auth-gate.md`) if this app ever gets
  real user accounts.
