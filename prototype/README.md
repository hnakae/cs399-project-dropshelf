

See the [project README](../README.md) for the full project overview, sprint progress, and documentation index. This file covers the technical detail for running and testing this app specifically.

## Environment variables

Fill in `.env.local` (already gitignored):

```
STRIPE_SECRET_KEY=       # test-mode secret key from https://dashboard.stripe.com/test/apikeys
STRIPE_WEBHOOK_SECRET=   # from `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DATABASE_URL=            # Postgres connection string (Neon, via Vercel Marketplace)
CLERK_SECRET_KEY=                     # provisioned by `vercel integration add clerk`
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=    # provisioned by `vercel integration add clerk`
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ADMIN_USER_ID=                        # the Clerk user id (see the Dashboard's Users
                                       # tab) of the one admin account -- requireAdmin()
                                       # rejects every other signed-in user
```

`DATABASE_URL` and friends (`PGHOST`, `PGUSER`, etc.) are provisioned automatically once
this repo is linked to a Vercel project with the Neon integration installed:

```bash
vercel link
vercel integration add neon
vercel env pull .env.local --yes
```

To test the webhook locally, install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and run:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

This prints a `whsec_...` signing secret — put it in `STRIPE_WEBHOOK_SECRET` and restart
`npm run dev`. Without this running, Stripe has no way to reach `localhost`, so webhook
events (and the order persistence they trigger) never fire, even though the checkout
flow itself works fine.

## Database

Postgres (Neon, via the Vercel Marketplace) with [Drizzle ORM](https://orm.drizzle.team/).
Schema lives in `lib/db/schema.ts`; the client (`getDb()`, lazily constructed so it's
safe at build time) lives in `lib/db/index.ts`.

```bash
npm run db:push    # push the schema in lib/db/schema.ts to the database
npm run db:seed    # seed the products table from lib/db/seed.ts
npm run db:studio  # open Drizzle Studio to browse the data
```

Three tables: `products` (replaces the old hardcoded array in `lib/data.ts`), `orders`,
and `order_items` (one order has many items; each item references a product). See
[`../docs/sprint-3-persistence/architecture.md`](../docs/sprint-3-persistence/architecture.md)
for the schema and the reasoning behind the SQL-over-NoSQL and Drizzle-over-Prisma calls.

## Order history

`/orders` lists every persisted order and its line items, read from Postgres on every
request (not cached — see `docs/sprint-3-persistence/updates/orders-view.md`). It's
gated by [Clerk](https://clerk.com) authentication (see `proxy.ts`), plus an identity
check — `requireAdmin()` only accepts the one Clerk user id in `ADMIN_USER_ID`, not any
signed-in user. This is defense-in-depth: this is still a single-shop-owner app with one
intended admin account, but Clerk instances allow public sign-up by default, so being
signed in was never sufficient on its own — see `lib/admin.ts`. This replaced the Sprint
3 shared-password Basic Auth gate
(`docs/sprint-3-persistence/updates/orders-view-auth-gate.md`) now that the app needs
real per-action authorization for the admin product/order mutations added in Sprint 4,
not just a read-only view gate.

## Admin

Signed-in users can manage products at `/admin/products` (create, edit, archive — see
`lib/products-actions.ts`) and cancel/refund an order from `/orders` (see
`lib/orders-actions.ts`). Every mutation calls `requireAdmin()` (`lib/admin.ts`)
independently of the `proxy.ts` route gate, since Server Actions are reachable even
when their page isn't rendered.

Cancelling an order retrieves its Stripe Checkout Session to find the underlying
PaymentIntent, issues a full Stripe refund, and marks the order `status: "refunded"`
in Postgres — a status transition, not general field-level order editing. It refuses
to double-refund an already-`"refunded"` order (checked before calling Stripe).

## Testing

The "buy" path — click Buy → Stripe Checkout → webhook → order confirmed — is the one flow this prototype actually has to get right, so it's covered by an automated suite rather than only manual clicking with the `4242 4242 4242 4242` test card.

```bash
npm test        # watch mode
npm run test:run  # single run, used before shipping
```

Suite: [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/), configured in `vitest.config.mts` / `vitest.setup.ts`. Tests live in `__tests__/`, mirroring the source tree:

- `lib/actions.ts` — `createCheckoutSession` builds the correct one-item Stripe session (price, currency, success/cancel URLs, and `metadata` carrying the product id/quantity/price for the webhook to consume) and redirects to it; rejects an unknown product id before calling Stripe; refuses to redirect if Stripe doesn't return a URL.
- `app/api/webhooks/stripe/route.ts` — rejects requests missing a signature or webhook secret, rejects a signature Stripe can't verify, persists an `orders` + `order_items` row for a verified `checkout.session.completed` event, skips persistence and logs an error if the event is missing product metadata, and doesn't double-insert on a duplicate webhook delivery for the same session.
- `app/checkout/success/page.tsx` — re-verifies the session against Stripe rather than trusting the redirect: no `session_id` → "Nothing to confirm", a `session_id` Stripe can't retrieve/verify → "Session not found" (caught rather than crashing into a 500), unpaid session → "Payment not completed", paid session → "Order confirmed".
- `lib/stripe.ts`, `lib/utils.ts`, `lib/data.ts` — env-driven client construction, price formatting, base-URL resolution, product lookups against the database (including the non-archived filter on `getProducts()`).
- `components/creator-profile.tsx`, `components/product-card.tsx` — render the profile and the Buy button/form correctly.
- `lib/admin.ts` — `requireAdmin()` throws when signed out, resolves the user id when signed in.
- `lib/db/validation.ts` — the refined product schemas reject a zero/negative price, an empty title, a non-URL image, and a malformed id, and trim whitespace on accepted input.
- `lib/products-actions.ts` — create/update/archive each call `requireAdmin()` and reject invalid input before ever touching the database.
- `lib/orders-actions.ts` — `cancelOrder` requires admin, rejects an unknown order, refuses to double-refund an already-`"refunded"` order without calling Stripe, and on the happy path retrieves the Checkout Session, refunds the right PaymentIntent (string or expanded object), and marks the order refunded.
- `components/cancel-order-button.tsx` — the confirm() gate blocks submission when declined and allows it through when accepted.

The real Stripe SDK is mocked at the `@/lib/stripe` module boundary (via `vi.mock`) instead of hitting Stripe's API, and the database client is mocked at the `@/lib/db` module boundary the same way, so the suite is deterministic, runs offline, and doesn't need live keys or a real database; `next/navigation`'s `redirect` and `next/cache`'s `revalidatePath` are mocked the same way since they only work inside a real Next.js request. `@clerk/nextjs/server`'s `auth` is mocked at the module boundary for `requireAdmin()` tests, so the suite doesn't need live Clerk keys either. Nothing here replaces occasionally re-running the real `stripe listen` + test-card flow by hand against the real database, but it does mean a regression in the checkout, webhook, persistence, admin, or refund logic fails `npm test` instead of only showing up when someone clicks a button.

Deliberately not tested: `proxy.ts` itself (its logic is now almost entirely `clerkMiddleware`/`createRouteMatcher` — Clerk's own code; the equivalent value is captured by testing `requireAdmin()` and confirming every mutating action calls it), and the plain fetch-and-render `/admin/products/**` pages (this repo has never tested pages without branching logic — only `checkout/success/page.tsx` is tested, because it has real branches).

## Running

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Requires `.env.local` — see
"Environment variables" above and the [project README](../README.md) for the full
setup steps.
