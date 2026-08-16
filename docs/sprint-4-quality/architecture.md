# Architecture — Sprint 4 (as built)

This supersedes `docs/sprint-3-persistence/architecture.md` with what actually got built
in Sprint 4: real per-user authentication (Clerk) replacing the shared-password Basic
Auth gate, full product CRUD (create/edit/archive), and an order cancel-and-refund
action. See [Deviations from Sprint 3](#deviations-from-sprint-3) for what changed and
why.

## Overview

DropShelf is still a single Next.js app (App Router) with no separate backend server.
What changed this sprint: there is now a third external system alongside Postgres and
Stripe — **Clerk**, the source of truth for admin identity. There is exactly one admin
account, created directly in the Clerk Dashboard — no public sign-up route is shipped.

## Major Components

**Database (`lib/db/`)**

Unchanged in shape from Sprint 3 except one addition: `products.isArchived` (boolean,
default `false`) supports soft-delete for the new admin product management (see below).
Archiving never removes a row — `order_items.productId` is a foreign key into
`products`, so a hard delete would either fail on any product that was ever ordered or
require cascading deletes that would corrupt historical order display. Schema change
applied with `npm run db:push`, same convention as every prior schema change this
project has made (no Drizzle migration files).

**Client — pages and components (`app/`, `components/`)**

- `app/page.tsx`, `components/creator-profile.tsx`, `components/product-card.tsx` —
  unchanged.
- `app/checkout/success/page.tsx` — **fixed this sprint.** `stripe.checkout.sessions.retrieve()`
  had no error handling, so a malformed or nonexistent `session_id` (e.g. a tampered
  URL) threw unhandled and crashed into Next's default 500 page. Now wrapped in
  try/catch, showing "Session not found" consistent with the page's other states
  ("Nothing to confirm" / "Payment not completed" / "Order confirmed"). This was the
  bug carried over from the original Sprint 4 kickoff scope (`acdc2cd`).
- `app/orders/page.tsx` — now also calls `requireAdmin()` directly (see Auth gate,
  below), in addition to being covered by the `proxy.ts` route matcher.
- `app/admin/layout.tsx` — **new.** Single shared `requireAdmin()` call for every
  `/admin/*` page.
- `app/admin/products/page.tsx`, `app/admin/products/new/page.tsx`,
  `app/admin/products/[id]/edit/page.tsx` — **new.** List (including archived, with an
  inline Archive form per row), create, and edit/archive pages. Plain Server Components
  + native `<form action={serverAction}>`, matching the existing checkout-button idiom —
  no client-side form state.
- `app/sign-in/[[...sign-in]]/page.tsx` — **new.** Renders Clerk's `<SignIn/>`.
- `components/cancel-order-button.tsx` — **new.** The one deliberate Client Component in
  the app, needed for a `confirm()` gate in front of a real-money action (a Stripe
  refund). Renders only when `order.status !== "refunded"`; no admin-check needed inside
  it, since the whole `/orders` page already sits behind the auth gate.
- `components/nav.tsx` — rewritten for Clerk: shows a "Sign in" control when signed out,
  and `Orders` / `Admin` links + `<UserButton/>` when signed in. Uses `@clerk/nextjs`'s
  `<Show when="signed-in">` / `<Show when="signed-out">` — a deviation from the original
  plan, which assumed the now-removed `<SignedIn>`/`<SignedOut>` components; caught by
  inspecting `@clerk/nextjs@7`'s actual exports rather than trusting stale cached docs.

**Auth gate (`proxy.ts`, `lib/admin.ts`)**

Two independent layers, on purpose:

1. **`proxy.ts`** — rewritten this sprint. It is **not** Basic Auth anymore — that
   description described Sprint 3's gate and no longer applies. It's now
   `clerkMiddleware` wrapping `createRouteMatcher(["/orders(.*)", "/admin(.*)"])`,
   calling `auth.protect()` for matched routes; a broad top-level `matcher` config is
   kept (per Clerk convention — narrowing it to just the protected paths breaks the
   session handshake on other routes). The old `ORDERS_VIEW_PASSWORD` / Basic Auth block
   is gone entirely.
2. **`lib/admin.ts` (`requireAdmin()`)** — **new.** `await auth()`, throws
   `"Admin authentication required."` if there's no signed-in `userId`. Called
   independently inside every mutating Server Action (below) and inside
   `app/orders/page.tsx` / `app/admin/layout.tsx`. This exists because Server Actions are
   reachable even when the page that renders their trigger isn't — a route-level gate
   alone doesn't cover them. `/orders` originally relied on the `proxy.ts` gate alone;
   partway through this sprint Clerk logged a runtime deprecation warning that
   middleware-only route matching (`createRouteMatcher`) is being replaced by
   per-resource checks, since path-matching can diverge from actual Next.js routing —
   `/orders/page.tsx` now also calls `requireAdmin()` directly, matching the pattern
   `/admin/*` already had via its layout (`d35d11b`).

**The admin model is intentionally flat: any signed-in Clerk user counts as admin.**
There is no role or permission system, and `requireAdmin()` does not check *which*
signed-in user it is — only that one exists. This matches the single-shop-owner scope
(one account, created by hand in the Clerk Dashboard). It is a real, confirmed decision,
not an oversight — but see [Open Questions](#open-questions-carried-into-sprint-5): it
depends on public sign-up staying disabled in the Clerk Dashboard, which is a
configuration state, not a code guarantee.

**Admin surface (`lib/admin.ts`, `lib/products-actions.ts`, `lib/orders-actions.ts`,
`lib/db/validation.ts`)**

- `lib/products-actions.ts` (`"use server"`) — kept separate from the buyer-facing
  `lib/actions.ts` so the trust boundary is visible by filename alone.
  `createProduct`/`updateProduct`/`archiveProduct` each call `requireAdmin()` first,
  validate via the schemas below, then `revalidatePath("/admin/products")` and
  `revalidatePath("/")`.
- `lib/orders-actions.ts` (`"use server"`) — `cancelOrder(orderId)`: `requireAdmin()`,
  loads the order, refuses to act if `status === "refunded"` (checked **before** any
  Stripe call — the double-refund guard), retrieves the Checkout Session to read
  `payment_intent` (handles both the string and expanded-object shape), calls
  `stripe.refunds.create()`, then sets `orders.status = "refunded"` and revalidates
  `/orders`. This is a status transition, not general field-level order editing.
- `lib/db/validation.ts` — **new.** Zod schemas generated from the Drizzle table
  definitions via `drizzle-zod` (`createInsertSchema`/`createUpdateSchema`), refined with
  real business rules: trimmed non-empty `title`/`description`, a positive integer
  `priceInCents`, a valid-URL `imageUrl`, a lowercase-hyphen-only `id`. Deriving the
  schema from the table definition means validation can't silently drift from what the
  database actually accepts.

**Route table**

| Method | Route | Handler | Purpose |
|---|---|---|---|
| GET | `/` | `app/page.tsx` | Storefront: profile + product grid (non-archived only) |
| POST (server action) | — | `lib/actions.ts: createCheckoutSession` | Create a Stripe Checkout Session, redirect to Stripe |
| GET | `/checkout/success?session_id=` | `app/checkout/success/page.tsx` | Re-verify payment against Stripe; now catches an invalid/unresolvable session instead of crashing |
| POST | `/api/webhooks/stripe` | `app/api/webhooks/stripe/route.ts` | Verify event, persist order + order item atomically — unaffected by the Clerk gate (not in the protected matcher) |
| GET | `/orders` | `app/orders/page.tsx` | Order history; gated by `proxy.ts` **and** a direct `requireAdmin()` call |
| GET | `/sign-in` | `app/sign-in/[[...sign-in]]/page.tsx` | Clerk's hosted sign-in UI — **new** |
| GET | `/admin/products` | `app/admin/products/page.tsx` | List all products (including archived); gated by `app/admin/layout.tsx`'s `requireAdmin()` — **new** |
| GET | `/admin/products/new` | `app/admin/products/new/page.tsx` | Create-product form — **new** |
| GET | `/admin/products/[id]/edit` | `app/admin/products/[id]/edit/page.tsx` | Edit/archive form — **new** |
| POST (server actions) | — | `lib/products-actions.ts`, `lib/orders-actions.ts` | Product CRUD + order cancel/refund, each independently gated — **new** |

## Data Flow

The buyer flow (storefront → checkout → webhook → `/checkout/success`) is unchanged from
Sprint 3, with the one fix noted above. New this sprint:

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

## Why SQL, and why Drizzle

Unchanged from Sprint 3 — see `docs/sprint-3-persistence/architecture.md` and
`ai-implementation-review.md` for the full reasoning.

## Deviations from Sprint 3

- **Clerk replaces the shared-password Basic Auth gate.** Sprint 3 gated `/orders` with
  HTTP Basic Auth against one shared `ORDERS_VIEW_PASSWORD` — acceptable for a
  single read-only internal page. Sprint 4 added mutations (product create/edit/archive,
  order refund) behind that same surface, which changes the risk: one leaked env var
  would now be a total compromise vector for real, money-moving mutations, not just read
  access to an internal view. Clerk was chosen over rolling a custom auth check because
  it's a natively-integrated Vercel Marketplace product with per-user sessions, not
  another shared secret.
- **Scope grew beyond the kickoff's "narrowly scoped Update or Delete" ask**, by
  explicit request — full Clerk auth, full product CRUD, and an order cancel/refund
  action, not just one Update-or-Delete capability. See `docs/sprint-4-quality/plan.md`.
- **`/checkout/success`'s 500-on-invalid-session bug is fixed** (see above) — it was
  initially deferred in favor of the larger CRUD/Clerk work, then picked back up and
  closed before the sprint ended, not silently dropped.

## Open Questions (carried into Sprint 5)

- **The admin model is "any signed-in user," with no identity check.** Clerk instances
  allow public sign-up by default. Until public sign-up is disabled in the Clerk
  Dashboard, a self-registered account would pass `requireAdmin()` and reach real Stripe
  refunds and product archiving. The documented security model (`prototype/README.md`:
  "single-shop-owner app with one account") and the deployed one disagree until that
  dashboard setting is confirmed — this is a configuration gap, not a code bug, and
  exactly the kind of thing that's easy to leave undone.
- **Creating the admin user in the Clerk Dashboard, and disabling public sign-up in
  Clerk's Restrictions settings, is still a manual step** — deliberately not automated.
  Until it's done, the signed-in admin walkthroughs (product CRUD, cancel/refund) are
  verified by automated test and by confirming the signed-out gating live, but not by a
  live signed-in browser walkthrough. See `manual-verification.md`.
- **`cancelOrder`'s refund and status write are not atomic.** `orders-actions.ts` calls
  `stripe.refunds.create()` and *then* writes `orders.status = "refunded"`. The
  double-refund guard reads that same `status` column before making any Stripe call, so
  if the status write fails after the Stripe refund succeeds, the order is refunded at
  Stripe but still eligible to be refunded again through this app. This was not solved
  the way the webhook's two-write consistency problem was (a single atomic statement) —
  it's an accepted scope call for this sprint, not an oversight, but it's a real gap
  worth reversing the order for (mark `"refunding"`, call Stripe, then mark
  `"refunded"`) if it's picked up.
- **Multi-item cart** — still deferred; research done, not built. See
  `docs/sprint-4-quality/plan.md`'s "Deferred — multi-item cart" section.
- **`creator` is still a hardcoded object** in `lib/data.ts` — unchanged from Sprint 3.

## Diagrams

Sequence diagrams for the buyer and admin flows, and a class diagram for the data model:
[`user-action-diagram.md`](user-action-diagram.md).
