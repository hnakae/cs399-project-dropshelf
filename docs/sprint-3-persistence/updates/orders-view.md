# Update — Orders view

Closes the "No order-history UI" item `architecture.md` listed as an open question:
orders were persisted and queryable, but only via `npm run db:studio` or a direct
query — no page in the app showed them.

## What was built

- **`lib/data.ts` — `getOrders()`.** One query joining `orders` → `order_items` →
  `products` (left joins, not inner joins — see below), grouped in application code into
  an `OrderWithItems[]` list: each order with its nested line items, ordered newest
  first (`createdAt` desc, `id` desc as a tiebreak for determinism).
- **`app/orders/page.tsx`.** A server component rendering that list — order id, status,
  timestamp, customer email, total, and line items — in the same visual language as the
  rest of the storefront (`font-display`/`font-mono`, the existing `ink`/`ink-soft`/
  `surface`/`line` design tokens). No new dependency; it's the same "server component
  calls a `lib/data.ts` function" shape as `app/page.tsx` and `getProducts()`.
- **`components/nav.tsx`**, wired into `app/layout.tsx`. A small site-wide nav
  ("Dropshelf" → `/`, "Orders" → `/orders`) so the new view is discoverable instead of
  only reachable by typing the URL.

## Why left joins, not inner joins

`getOrders()` joins with `LEFT JOIN`, not `INNER JOIN`. An inner join would silently
hide any `orders` row with zero `order_items` rows — which is now possible again, on
paper, only in the edge case the atomic-write fix (`updates/webhook-atomic-write.md`)
was written to prevent going forward, but which is exactly the shape of the *pre-fix*
historical gap this sprint started with. The page renders that case explicitly ("No
line items recorded for this order.") instead of making an incomplete order
disappear from the list. Given this sprint's course-stated goal is measuring "the
project against evidence, not intent," a view of order history that can hide its own
gaps would be counterproductive.

## Caching decision: `force-dynamic`

The first working version of this page had no explicit rendering-mode export.
`npm run build` showed `/orders` as **static** (`○`) — prerendered once at build time,
identically to `/`. That's correct for the product catalog (`/`), which rarely changes,
but wrong for an orders view: a static `/orders` would freeze at whatever was in the
database when the app was last built, and a new order wouldn't appear until the next
deploy — silently defeating the entire purpose of "a live view of the database."

Added `export const dynamic = "force-dynamic";` to `app/orders/page.tsx`, confirmed by
re-running `npm run build`: `/orders` now shows `ƒ` (dynamic, rendered fresh per
request). This was checked against this project's own caching docs
(`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`) —
this app does not have Next.js Cache Components (`cacheComponents: true`) enabled in
`next.config.ts`, so it uses the older static/dynamic model where `force-dynamic` is
still the correct, current API, rather than the newer `"use cache"` directive.

## Access control

`/orders` shows customer email addresses, and the app has no user-account system at
all. Full detail and the Clerk-vs-shared-secret reasoning is in
`updates/orders-view-auth-gate.md` — summary: gated with HTTP Basic Auth in a new
`proxy.ts` (username `orders`, password from `ORDERS_VIEW_PASSWORD` in `.env.local`,
gitignored, never committed).

## Verification

- `npm run lint` — clean.
- `npm run test:run` — 27/27 passing (no existing test asserted on page content that
  would break; no new automated test was written for `app/orders/page.tsx` itself —
  see "Known gap" below).
- `npm run build` — succeeds; `/orders` confirmed dynamic (`ƒ`), not static.
- **Live check against real infrastructure, not just the build output:** started
  `npm run dev`, then `curl`'d `/orders` directly (bypassing the browser, so no
  client-side cache could mask a server-side problem): `401` with no credentials, `401`
  with the wrong password, `200` with the right one. The `200` response body was
  checked against a direct database query run at the same time — the page showed
  orders `#1`, `#4`, `#5` with totals `$32.00` / `$58.00` / `$58.00` (via
  `formatPrice`), matching the actual `orders` rows exactly, not just "a 200 came
  back."
- **A real bug this caught, live:** while testing, order line items were deleted from
  `order_items` via Drizzle Studio, leaving 3 `orders` rows with zero items each.
  Reloading `/orders` showed the change immediately — proof `force-dynamic` actually
  works, since a stale/cached page would not have reflected a change made completely
  outside the app.

## Known gap

No automated test exists yet for `getOrders()` or `app/orders/page.tsx` — unlike every
other data-layer function and route in this project, which has Vitest coverage
(`__tests__/lib/data.test.ts` currently only covers `getProducts`/`getProductById`).
This was verified manually and thoroughly (above), but manual verification and
automated coverage are different claims, per this sprint's own stated lesson. Worth a
Sprint 4 test-coverage pass.

## Engineering judgment

**Accepted:** building `getOrders()` as one joined query grouped in JS, rather than
Drizzle's relational query API (`db.query.orders.findMany({ with: { items: true } } )`),
to stay consistent with the plain-select style already used everywhere else in
`lib/data.ts` — no relations were defined in `lib/db/schema.ts`, and introducing them
for one query would be a schema change bigger than the feature itself.

**Rejected/postponed:** a "delete order" or "refund" action from this view. The task
was a read-only view of existing data; adding mutation from this page is new-feature
scope beyond what was asked, and this sprint is explicitly framed as stabilization, not
new features.
