# Architecture

## Overview

DropShelf is a single Next.js App Router application — no separate backend server. It
has three external systems of record, each owning a different slice of state:

```text
Browser
  |
  v
Next.js (App Router: Server Components, Server Actions, Route Handlers)
  |         |                |
  v         v                v
Postgres  Stripe            Clerk
(Neon)    (checkout,        (admin
          webhook,          identity)
          refunds)
```

- **Postgres** (Neon, via the Vercel Marketplace) is the source of truth for the
  product catalog and order history.
- **Stripe** is the source of truth for payment and checkout-session state, and now
  also for refunds.
- **Clerk** is the source of truth for admin identity. There is exactly one admin
  account, created directly in the Clerk Dashboard — no public sign-up route is
  shipped.

This file describes the app as it stands after Sprint 4 (Clerk auth, admin product
CRUD, order cancel/refund). It is updated in place each sprint rather than duplicated
into a new file — see [`project-retrospective.md`](project-retrospective.md) for how
this architecture got here sprint by sprint, and `git log` / the `sprint-1`, `sprint-2`,
`sprint-3` branches for the literal history of earlier states.

## Components and Responsibilities

### Browser / UI (`app/`, `components/`)

- `app/page.tsx` — the storefront. Server Component; calls `getProducts()` (non-archived
  only) and renders the catalog.
- `components/creator-profile.tsx`, `components/product-card.tsx` — presentational,
  render whatever `Creator`/`Product` objects they're given.
- `app/checkout/success/page.tsx` — re-verifies the checkout session directly against
  Stripe (`expand: ["line_items"]`) rather than trusting the redirect or reading the
  database. Branches on: no `session_id` → "Nothing to confirm"; Stripe can't
  retrieve/verify the session → "Session not found" (caught, not a 500); unpaid →
  "Payment not completed"; paid → "Order confirmed".
- `app/orders/page.tsx` — lists every persisted order with its line items, read from
  Postgres on every request (`export const dynamic = "force-dynamic"` — order data
  changes every checkout, so this is never prerendered). Calls `requireAdmin()` itself
  in addition to the proxy-level gate.
- `app/admin/products/**` — list (including archived), create, and edit/archive pages.
  Plain Server Components + native `<form action={serverAction}>`, no client-side form
  state.
- `components/cancel-order-button.tsx` — the one deliberate Client Component in the app,
  needed for a `confirm()` gate in front of a real-money action (Stripe refund). Renders
  only when `order.status !== "refunded"`.
- `components/nav.tsx` — site-wide nav; shows sign-in/out and, when signed in, the
  `/admin/products` link.

### Auth gate (`proxy.ts`, `lib/admin.ts`)

Two independent layers, on purpose:

1. **`proxy.ts`** — Clerk middleware (`clerkMiddleware` + `createRouteMatcher(["/orders(.*)", "/admin(.*)"])`),
   calls `auth.protect()` for matched routes. This is the "optimistic" gate: it redirects
   a signed-out visitor to `/sign-in` before the page even renders.
2. **`lib/admin.ts` (`requireAdmin()`)** — called independently inside every mutating
   Server Action (`createProduct`, `updateProduct`, `archiveProduct`, `cancelOrder`) and
   inside `app/orders/page.tsx` and `app/admin/layout.tsx`. This exists because Server
   Actions are reachable even when the page that renders their trigger isn't — a
   proxy-level route gate alone doesn't cover them. `/orders` started out relying on the
   proxy gate alone; it now also calls `requireAdmin()` directly, after Clerk's own
   deprecation warning made clear that middleware-only path-matching can diverge from
   actual Next.js routing.

The admin model is intentionally flat: **any signed-in Clerk user counts as admin.**
There is no role or permission system. This matches the single-shop-owner scope — one
account, created by hand in the Clerk Dashboard, no public sign-up. It is a real
constraint to be able to defend, not an oversight: see
[`ai-implementation-review.md`](ai-implementation-review.md).

### Server actions and routes (`lib/`, `app/api/`)

- `lib/actions.ts` (`"use server"`) — `createCheckoutSession(productId)`: public,
  buyer-facing. Looks up the product in the database, creates a Stripe Checkout Session
  carrying `{ productId, quantity, unitPriceInCents }` as `metadata`, redirects to
  Stripe. Kept in its own file, separate from the admin actions below, so the trust
  boundary is visible by filename alone.
- `lib/products-actions.ts` (`"use server"`) — `createProduct`, `updateProduct`,
  `archiveProduct`. Each calls `requireAdmin()` first, validates via the schemas in
  `lib/db/validation.ts`, then calls `revalidatePath("/admin/products")` and
  `revalidatePath("/")`.
- `lib/orders-actions.ts` (`"use server"`) — `cancelOrder(orderId)`. `requireAdmin()`,
  loads the order, refuses to act if `status === "refunded"` (checked **before** any
  Stripe call, so a double-click can't double-refund), retrieves the Checkout Session to
  read `payment_intent` (string or expanded object, both handled), calls
  `stripe.refunds.create()`, sets `orders.status = "refunded"`, revalidates `/orders`.
  This is a status transition, not general field-level order editing.
- `app/api/webhooks/stripe/route.ts` — public but signature-verified. Rejects requests
  missing a signature or `STRIPE_WEBHOOK_SECRET` (400), rejects a signature Stripe can't
  verify (400). On a verified `checkout.session.completed` event, writes the `orders`
  row and its `order_items` row in a single parameterized SQL statement (a
  `WITH ... RETURNING` CTE) — atomic by virtue of being one Postgres statement, since
  `drizzle-orm/neon-http` has no `db.transaction()` support. `ON CONFLICT
  (stripe_checkout_session_id) DO NOTHING` on the `orders` insert makes a redelivered
  webhook a complete no-op (the CTE yields no rows, so the `order_items` insert selects
  from nothing). Logs an error and returns without writing anything if the event's
  session is missing the product metadata `createCheckoutSession` attached.

### Validation (`lib/db/validation.ts`)

Zod schemas generated from the Drizzle table definitions via `drizzle-zod`
(`createInsertSchema` / `createUpdateSchema`), refined with business rules: trimmed
non-empty `title`/`description`, a positive integer `priceInCents`, a valid-URL
`imageUrl`, a lowercase-hyphen-only `id`. Deriving the schema from the table definition
means validation can't silently drift from what the database actually accepts.

### Database (`lib/db/`)

- `lib/db/schema.ts` — three Drizzle tables:
  - **`products`** — `id` (text PK, e.g. `"tide-mug"`), `title`, `description`,
    `priceInCents`, `imageUrl`, `isArchived` (boolean, default `false`, added Sprint 4).
  - **`orders`** — `id` (serial), `stripeCheckoutSessionId` (unique), `status` (plain
    `text`, unconstrained — currently `"paid"` or `"refunded"`), `customerEmail`,
    `amountTotalInCents`, `createdAt`.
  - **`orderItems`** — `id` (serial), `orderId` (FK → `orders.id`), `productId` (FK →
    `products.id`), `quantity`, `unitPriceInCents`.
- `lib/db/index.ts` — `getDb()`, a lazily-constructed Drizzle client over
  `@neondatabase/serverless`'s HTTP driver. Lazy because `next build` evaluates
  top-level module code, and constructing the client eagerly would crash the first
  build before `DATABASE_URL` exists.
- `lib/db/seed.ts` — idempotent (`onConflictDoUpdate`) seed script for the three sample
  products.
- Provisioning: Neon Postgres via `vercel integration add neon`, so `DATABASE_URL` and
  friends are injected into the linked Vercel project and pulled locally with
  `vercel env pull`, instead of a separately-managed credential set.

**Archiving is soft delete, not row deletion.** `archiveProduct` only sets
`isArchived = true`; the row is never removed. `order_items.productId` is a foreign key
into `products`, so a hard delete would either fail on any product that was ever
ordered, or require cascading deletes that would corrupt historical order display.
`getOrders()` and `getProductById()` are unaffected by archiving — only
`getProducts()` (the storefront) filters `isArchived = false`.

Schema changes are applied with `npm run db:push`, not Drizzle migration files — this
project has used `db:push` since the very first schema (Sprint 3) and Sprint 4 continued
that convention for a single boolean column rather than introducing migration files for
one change.

## Data Flows

### Buy flow (public)

```text
Buyer -> GET /                     -> getProducts() (non-archived only)
Buyer -> click Buy                 -> createCheckoutSession(productId)
                                       -> Stripe Checkout Session created (metadata attached)
                                       -> redirect to Stripe
Buyer -> pays on Stripe            -> Stripe redirects to /checkout/success?session_id=...
                                       -> re-verify against Stripe directly, render result

  (independently, asynchronously)
Stripe -> POST /api/webhooks/stripe (checkout.session.completed)
                                       -> verify signature
                                       -> atomic insert: orders + order_items
```

Steps 4 and 5 above are intentionally decoupled: the webhook delivery is asynchronous
and not guaranteed to land before the buyer's browser redirects back, so
`/checkout/success` never reads the database — it always re-verifies against Stripe
directly. See [`diagrams.md`](diagrams.md) for the full sequence diagram, including the
`par` block showing these as parallel, independent paths.

### Admin flows (Clerk-gated: `/orders`, `/admin/*`)

```text
Admin -> GET /orders or /admin/products
      -> proxy.ts: signed out? redirect to /sign-in
      -> requireAdmin() (resource-level, independent of the proxy gate)

Cancel & Refund:
      -> requireAdmin() -> already refunded? throw, no Stripe call
                         -> retrieve Checkout Session -> refunds.create()
                         -> orders.status = "refunded" -> revalidate /orders

Manage products:
      -> requireAdmin() -> Zod validate -> insert/update products
                         -> revalidate /admin/products and /
```

Full sequence diagram: [`diagrams.md`](diagrams.md).

## Why These Choices

**SQL over NoSQL.** The data is genuinely relational — an order has many items, each
item references a product — the textbook case for foreign keys and joins. A document
store would mean duplicating product data into every order document or reimplementing
joins by hand.

**Drizzle over Prisma.** Both are viable; Drizzle was chosen because its schema is
plain TypeScript with no separate DSL file or codegen step, and maps closely to the SQL
it actually produces, which made it easier to explain directly. Prisma's `@relation`
syntax is arguably more explicit for demonstrating relational understanding to a
reviewer, and remains a reasonable alternative.

**Clerk over continuing the shared-password gate.** Sprint 3 gated `/orders` with HTTP
Basic Auth against one shared `ORDERS_VIEW_PASSWORD` — acceptable for a single
read-only internal page. Sprint 4 added mutations (product create/edit/archive, order
refund) behind that same surface, which changes the risk: one leaked env var would now
be a total compromise vector for real, money-moving mutations, not just read access to
an internal view. Clerk was chosen over rolling a custom auth check because it's a
natively-integrated Vercel Marketplace product with per-user sessions, not another
shared secret.

**Any signed-in user is admin — no RBAC.** Confirmed explicitly rather than defaulted
to: this is a single-shop-owner app with exactly one account. Adding roles or
`publicMetadata` checks would be speculative complexity for a scope this narrow.

**Metadata-based order correlation, not a second Stripe API call.** The webhook reads
`productId`/`quantity`/`unitPriceInCents` directly from the event's `session.metadata`
instead of calling `stripe.checkout.sessions.retrieve` with `expand: ["line_items"]`.
Simpler, and sufficient because every order today has exactly one line item (see
Deferred Work).

## Error Handling Boundaries

- `/checkout/success`: no `session_id` → "Nothing to confirm"; Stripe can't
  retrieve/verify the session → "Session not found" (caught explicitly — this was a
  500-crashing gap through Sprint 3, fixed in Sprint 4); unpaid → "Payment not
  completed"; paid → "Order confirmed".
- `/api/webhooks/stripe`: missing signature or webhook secret → 400; signature Stripe
  can't verify → 400; verified event missing product metadata → logs an error, persists
  nothing, still returns 200 (Stripe doesn't need a retry for an event this route
  intentionally chooses not to act on).
- `cancelOrder`: unknown order id → throws before any Stripe call; already-`"refunded"`
  order → throws before any Stripe call (the double-refund guard); Checkout Session with
  no resolvable `payment_intent` → throws before calling `stripe.refunds.create`.
- `createProduct` / `updateProduct`: Zod validation runs before any database write;
  a thrown `ZodError` surfaces via Next's default error boundary (no per-field inline
  form UI — same pattern the app already used for its one prior validation case).

## Deferred Work / Open Questions

- **Multi-item cart.** Every order today has exactly one `order_item`, since
  `createCheckoutSession` takes a single `productId` with quantity hardcoded to `1` —
  the `Order` → many `OrderItem` relationship in the schema has never actually been
  exercised. Research (Stripe's per-line-item metadata shape, the webhook's
  `listLineItems` expansion, `sql.join` for a bulk insert) is done but not built — a
  real cart is new client-side state and UI, not a small tweak. See the "Deferred —
  multi-item cart" record folded into
  [`project-retrospective.md`](project-retrospective.md).
- **`creator` is still a hardcoded object** in `lib/data.ts`. There's exactly one
  creator, nothing writes to it, and a single-row table wouldn't demonstrate anything
  relational.
- **No RBAC.** Flagged above as an accepted, explicit scope constraint — worth
  revisiting only if this app ever needs more than one admin identity.
- **Creating the admin user in the Clerk Dashboard, and disabling public sign-up in
  Clerk's Restrictions settings, is a manual step** — deliberately not automated. Until
  it's done, the signed-in admin walkthroughs (product CRUD, cancel/refund) are verified
  by automated test and by confirming the signed-out gating live, but not by a live
  signed-in browser walkthrough.

## Diagrams

Sequence diagrams for the buyer and admin flows, and a class diagram for the data
model: [`diagrams.md`](diagrams.md).
