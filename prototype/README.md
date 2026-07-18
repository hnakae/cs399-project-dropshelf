

See the [project README](../README.md) for the full project overview, sprint progress, and documentation index. This file covers the technical detail for running and testing this app specifically.

## Environment variables

Fill in `.env.local` (already gitignored):

```
STRIPE_SECRET_KEY=       # test-mode secret key from https://dashboard.stripe.com/test/apikeys
STRIPE_WEBHOOK_SECRET=   # from `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DATABASE_URL=            # Postgres connection string (Neon, via Vercel Marketplace)
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

## Testing

The "buy" path — click Buy → Stripe Checkout → webhook → order confirmed — is the one flow this prototype actually has to get right, so it's covered by an automated suite rather than only manual clicking with the `4242 4242 4242 4242` test card.

```bash
npm test        # watch mode
npm run test:run  # single run, used before shipping
```

Suite: [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/), configured in `vitest.config.mts` / `vitest.setup.ts`. Tests live in `__tests__/`, mirroring the source tree:

- `lib/actions.ts` — `createCheckoutSession` builds the correct one-item Stripe session (price, currency, success/cancel URLs, and `metadata` carrying the product id/quantity/price for the webhook to consume) and redirects to it; rejects an unknown product id before calling Stripe; refuses to redirect if Stripe doesn't return a URL.
- `app/api/webhooks/stripe/route.ts` — rejects requests missing a signature or webhook secret, rejects a signature Stripe can't verify, persists an `orders` + `order_items` row for a verified `checkout.session.completed` event, skips persistence and logs an error if the event is missing product metadata, and doesn't double-insert on a duplicate webhook delivery for the same session.
- `app/checkout/success/page.tsx` — re-verifies the session against Stripe rather than trusting the redirect: no `session_id` → "Nothing to confirm", unpaid session → "Payment not completed", paid session → "Order confirmed".
- `lib/stripe.ts`, `lib/utils.ts`, `lib/data.ts` — env-driven client construction, price formatting, base-URL resolution, product lookups against the database.
- `components/creator-profile.tsx`, `components/product-card.tsx` — render the profile and the Buy button/form correctly.

The real Stripe SDK is mocked at the `@/lib/stripe` module boundary (via `vi.mock`) instead of hitting Stripe's API, and the database client is mocked at the `@/lib/db` module boundary the same way, so the suite is deterministic, runs offline, and doesn't need live keys or a real database; `next/navigation`'s `redirect` is mocked the same way in the action test since it only works inside a real Next.js request. Nothing here replaces occasionally re-running the real `stripe listen` + test-card flow by hand against the real database, but it does mean a regression in the checkout, webhook, persistence, or confirmation logic fails `npm test` instead of only showing up when someone clicks Buy.

## Running

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Requires `.env.local` — see
"Environment variables" above and the [project README](../README.md) for the full
setup steps.
