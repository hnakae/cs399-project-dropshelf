DropShelf is a single-creator storefront: a profile page, a product listing, and Stripe Checkout for buying one item at a time. Next.js app bootstrapped with `create-next-app`.

See the [project README](../README.md) for the full project overview, sprint progress, and documentation index. This file covers the technical detail for running and testing this app specifically.

## Environment variables

Fill in `.env.local` (already gitignored):

```
STRIPE_SECRET_KEY=       # test-mode secret key from https://dashboard.stripe.com/test/apikeys
STRIPE_WEBHOOK_SECRET=   # from `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

To test the webhook locally, install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and run:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Testing

The "buy" path — click Buy → Stripe Checkout → webhook → order confirmed — is the one flow this prototype actually has to get right, so it's covered by an automated suite rather than only manual clicking with the `4242 4242 4242 4242` test card.

```bash
npm test        # watch mode
npm run test:run  # single run, used before shipping
```

Suite: [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/), configured in `vitest.config.mts` / `vitest.setup.ts`. Tests live in `__tests__/`, mirroring the source tree:

- `lib/actions.ts` — `createCheckoutSession` builds the correct one-item Stripe session (price, currency, success/cancel URLs) and redirects to it; rejects an unknown product id before calling Stripe; refuses to redirect if Stripe doesn't return a URL.
- `app/api/webhooks/stripe/route.ts` — rejects requests missing a signature or webhook secret, rejects a signature Stripe can't verify, and accepts a verified `checkout.session.completed` event.
- `app/checkout/success/page.tsx` — re-verifies the session against Stripe rather than trusting the redirect: no `session_id` → "Nothing to confirm", unpaid session → "Payment not completed", paid session → "Order confirmed".
- `lib/stripe.ts`, `lib/utils.ts`, `lib/data.ts` — env-driven client construction, price formatting, base-URL resolution, product lookups.
- `components/creator-profile.tsx`, `components/product-card.tsx` — render the profile and the Buy button/form correctly.

The real Stripe SDK is mocked at the `@/lib/stripe` module boundary (via `vi.mock`) instead of hitting Stripe's API, so the suite is deterministic and doesn't need live keys; `next/navigation`'s `redirect` is mocked the same way in the action test since it only works inside a real Next.js request. Nothing here replaces occasionally re-running the real `stripe listen` + test-card flow by hand, but it does mean a regression in the checkout, webhook, or confirmation logic fails `npm test` instead of only showing up when someone clicks Buy.

## Running

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Requires `.env.local` — see
"Environment variables" above and the [project README](../README.md) for the full
setup steps.
