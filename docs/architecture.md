# Architecture — Sprint 5 (as built)

Sprint 1–4 documentation lives on each sprint's own branch (`sprint-1`, `sprint-2`,
`sprint-3`, `sprint-4-quality`), not in this branch's `docs/` folder — only this
sprint's docs ship here. This document therefore describes the system standalone, not
as a diff — a reader on this branch has no other architecture doc to fall back on.

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
- **Stripe** is the source of truth for payment, checkout-session, and refund state.
- **Clerk** is the source of truth for *authentication* (is there a signed-in user).
  *Authorization* (is this signed-in user the admin) is enforced independently in this
  app's own code — see [Auth gate](#auth-gate-proxyts-libadmints), below. This split is
  this sprint's main architectural change.

## Major Components

### Database (`lib/db/`)

Three Drizzle tables, unchanged in shape from Sprint 4:

- **`products`** — `id` (text PK, e.g. `"tide-mug"`), `title`, `description`,
  `priceInCents`, `imageUrl`, `isArchived` (boolean, default `false` — soft delete).
- **`orders`** — `id` (serial), `stripeCheckoutSessionId` (unique), `status` (plain
  `text`, unconstrained — now `"paid"`, `"refunding"`, or `"refunded"`; see
  [Admin surface](#admin-surface-libadminlibproducts-actionslib order-actions-libdbvalidation)),
  `customerEmail`, `amountTotalInCents`, `createdAt`.
- **`orderItems`** — `id` (serial), `orderId` (FK → `orders.id`), `productId` (FK →
  `products.id`), `quantity`, `unitPriceInCents`.

`lib/db/index.ts` exposes a lazily-constructed Drizzle client (`getDb()`) over
`@neondatabase/serverless`'s HTTP driver — lazy because `next build` evaluates
top-level module code, and a database env var isn't guaranteed to exist yet on a first
deploy. Schema changes are applied with `npm run db:push`; this project has never used
Drizzle migration files.

### Client — pages and components (`app/`, `components/`)

- `app/page.tsx` — the storefront. Server Component; `getProducts()` (non-archived
  only).
- `components/creator-profile.tsx`, `components/product-card.tsx` — presentational.
- `app/checkout/success/page.tsx` — re-verifies the checkout session directly against
  Stripe. Branches on: no `session_id` → "Nothing to confirm"; Stripe can't
  retrieve/verify the session → "Session not found"; unpaid → "Payment not completed";
  paid → "Order confirmed".
- `app/orders/page.tsx` — lists every persisted order, read from Postgres on every
  request (`force-dynamic`). Calls `requireAdmin()` directly, in addition to the
  `proxy.ts` gate.
- `app/admin/layout.tsx`, `app/admin/products/**` — product list (including archived),
  create, and edit/archive pages. Plain Server Components + native
  `<form action={serverAction}>`.
- `app/sign-in/[[...sign-in]]/page.tsx` — Clerk's hosted `<SignIn/>`.
- `components/cancel-order-button.tsx` — the one deliberate Client Component, needed
  for a `confirm()` gate in front of a real-money action. Renders whenever
  `order.status !== "refunded"` — including during a stuck `"refunding"` state, so a
  failed attempt can be retried rather than leaving the admin with no way to act (see
  [Admin surface](#admin-surface-libadminlibproducts-actionslib order-actions-libdbvalidation)).
- `components/nav.tsx` — sign-in/out control, `<UserButton/>`, and `/admin/products`
  link when signed in.

### Auth gate (`proxy.ts`, `lib/admin.ts`)

Two independent layers:

1. **`proxy.ts`** — `clerkMiddleware` wrapping
   `createRouteMatcher(["/orders(.*)", "/admin(.*)"])`, calling `auth.protect()` on
   matched routes. This only proves a request is *authenticated* — it doesn't know or
   care *who* signed in.
2. **`lib/admin.ts` (`requireAdmin()`)** — **this sprint's core change.** Previously,
   any signed-in Clerk user passed this check; that was a real gap, since Clerk
   instances allow public sign-up by default, so "signed in" and "is the shop's one
   admin" were never actually the same claim. `requireAdmin()` now reads `ADMIN_USER_ID`
   from the environment at module load and throws immediately if it's unset (fails
   closed, matching `lib/stripe.ts`'s existing pattern for required config), then
   compares the signed-in `userId` against it — a mismatch throws the same generic
   `"Admin authentication required."` error a signed-out request gets, so the failure
   doesn't leak which check failed. Called independently inside every mutating Server
   Action and inside `app/orders/page.tsx` / `app/admin/layout.tsx`, since Server
   Actions are reachable even when the page that renders their trigger isn't.

This is defense-in-depth, not a replacement for the Clerk Dashboard setting: disabling
public sign-up in Clerk's Restrictions settings is still the intended primary control
(see [Open Questions](#open-questions)). `ADMIN_USER_ID` means the app no longer
depends on that dashboard toggle *alone* to keep out a self-registered account.

### Admin surface (`lib/admin.ts`, `lib/products-actions.ts`, `lib/orders-actions.ts`, `lib/db/validation.ts`)

- `lib/products-actions.ts` — `createProduct`/`updateProduct`/`archiveProduct`, each
  `requireAdmin()` first, validate via the schemas below, then
  `revalidatePath("/admin/products")` and `revalidatePath("/")`.
- `lib/orders-actions.ts` — `cancelOrder(orderId)`: `requireAdmin()`, loads the order,
  refuses to act if `status === "refunded"` (before any Stripe call — the double-refund
  guard), retrieves the Checkout Session to read `payment_intent`. **This sprint's
  second change:** the status write is now split around the Stripe call instead of
  happening once, after it. `orders.status` is set to `"refunding"` *before*
  `stripe.refunds.create()` runs, and only set to `"refunded"` after it succeeds.
  Previously the write happened only after the refund, which meant a failure between
  the Stripe call succeeding and the database write landing left the order still
  reading `"paid"` — passing the double-refund guard on a retry and risking a second
  refund attempt at Stripe for the same order. Now that failure mode leaves the order
  visibly stuck at `"refunding"` instead. A retry from that state is safe either way: if
  the Stripe call never actually ran, it runs now; if it already succeeded, Stripe
  itself rejects re-refunding an already-refunded charge, surfacing a clear error
  instead of silently double-refunding.
- `lib/db/validation.ts` — Zod schemas generated from the Drizzle table definitions via
  `drizzle-zod`, refined with real business rules (trimmed non-empty text fields, a
  positive integer price, a valid-URL image, a slug-shaped product id).

### Server actions and routes (`lib/`, `app/api/`)

- `lib/actions.ts` — `createCheckoutSession(productId)`: public, buyer-facing. Looks up
  the product, creates a Stripe Checkout Session carrying
  `{ productId, quantity, unitPriceInCents }` as `metadata`, redirects to Stripe.
- `app/api/webhooks/stripe/route.ts` — public but signature-verified. On a verified
  `checkout.session.completed` event, writes the `orders` row and its `order_items` row
  in one parameterized `WITH ... RETURNING` CTE — atomic by virtue of being one Postgres
  statement, since `drizzle-orm/neon-http` has no `db.transaction()` support.
  `ON CONFLICT (stripe_checkout_session_id) DO NOTHING` makes a redelivered webhook a
  complete no-op.

## Route table

| Method | Route | Handler | Purpose |
| --- | --- | --- | --- |
| GET | `/` | `app/page.tsx` | Storefront: profile + product grid (non-archived only) |
| POST (server action) | — | `lib/actions.ts: createCheckoutSession` | Create a Stripe Checkout Session, redirect to Stripe |
| GET | `/checkout/success?session_id=` | `app/checkout/success/page.tsx` | Re-verify payment against Stripe |
| POST | `/api/webhooks/stripe` | `app/api/webhooks/stripe/route.ts` | Verify event, persist order + order item atomically |
| GET | `/orders` | `app/orders/page.tsx` | Order history; `proxy.ts` gate + direct `requireAdmin()` |
| GET | `/sign-in` | `app/sign-in/[[...sign-in]]/page.tsx` | Clerk's hosted sign-in UI |
| GET | `/admin/products` | `app/admin/products/page.tsx` | List all products (including archived) |
| GET | `/admin/products/new` | `app/admin/products/new/page.tsx` | Create-product form |
| GET | `/admin/products/[id]/edit` | `app/admin/products/[id]/edit/page.tsx` | Edit/archive form |
| POST (server actions) | — | `lib/products-actions.ts`, `lib/orders-actions.ts` | Product CRUD + order cancel/refund, each independently gated |

## Data Flow

### Buy flow (public, unchanged)

```text
Buyer -> GET /                     -> getProducts() (non-archived only)
Buyer -> click Buy                 -> createCheckoutSession(productId)
                                       -> Stripe Checkout Session created
                                       -> redirect to Stripe
Buyer -> pays on Stripe            -> redirect to /checkout/success?session_id=...
                                       -> re-verify against Stripe directly

  (independently, asynchronously)
Stripe -> POST /api/webhooks/stripe (checkout.session.completed)
                                       -> verify signature -> atomic insert
```

### Admin flows (Clerk-gated, identity-checked)

```text
Admin -> GET /orders or /admin/products
      -> proxy.ts: signed out? redirect to /sign-in
      -> requireAdmin(): signed in as someone other than ADMIN_USER_ID? reject
                          (same error as signed-out, no distinction leaked)

Cancel & Refund:
      -> requireAdmin() -> already refunded? throw, no Stripe call
                         -> orders.status = "refunding"
                         -> refunds.create()
                         -> orders.status = "refunded" -> revalidate /orders

Manage products:
      -> requireAdmin() -> Zod validate -> insert/update products
                         -> revalidate /admin/products and /
```

## Why SQL, Why Drizzle, Why Clerk

Unchanged from earlier sprints — the data is relational (SQL over NoSQL), Drizzle's
schema-as-TypeScript made it easier to reason about directly (over Prisma), and Clerk
replaced a shared-password gate once the admin surface started making real,
money-moving mutations rather than just serving a read-only view. None of that
reasoning changed this sprint.

## Sprint 5 Changes

- **`requireAdmin()` checks identity, not just authentication** (`lib/admin.ts`) — see
  [Auth gate](#auth-gate-proxyts-libadmints).
- **`cancelOrder`'s refund and status write are no longer effectively one step** — the
  `"refunding"` intermediate state makes a mid-flight failure visible instead of silent
  (see [Admin surface](#admin-surface-libadminlibproducts-actionslib order-actions-libdbvalidation)).
- **Docs restructured**: Sprint 1–4's `docs/` folders were removed from this branch
  (they remain on their own branches); the root stub files now point at this document
  instead. This is an organizational change with no runtime effect.
- **Root `README.md`** gained a Prerequisites section (Node version, package manager,
  the accounts this app depends on) and had its environment-variable checklist
  corrected — it still listed the retired `ORDERS_VIEW_PASSWORD` from Sprint 3 and was
  missing every Clerk variable and `ADMIN_USER_ID`.

## Open Questions

- **Disabling public sign-up in the Clerk Dashboard is still the user's own manual
  step**, and — unlike the `ADMIN_USER_ID` code check — its current state couldn't be
  confirmed from this environment: the Clerk Backend API's
  `GET /v1/instance/restrictions` returns `405` (write-only), so there's no read-only
  way to verify it from here. `ADMIN_USER_ID` means a self-registered account can no
  longer pass `requireAdmin()` even if sign-up is still open, but the dashboard setting
  is still the intended primary control, not a redundant one.
- **The `"refunding"` state has no automated recovery path.** If a refund fails after
  the `"refunding"` write (e.g. the Stripe call itself errors), the order stays there
  until an admin retries via the UI. That's a deliberate choice — a visible stuck state
  over a silent double-refund risk — but there's still no way to tell, from the
  `/orders` list alone, whether a `"refunding"` order is mid-retry or has been stuck for
  a while.
- **Multi-item cart** — still deferred, unchanged from Sprint 4; research done, not
  built.
- **`creator` is still a hardcoded object** in `lib/data.ts`.
