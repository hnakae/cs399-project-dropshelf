# Manual Verification — Sprint 3

Performed 2026-07-18 on the `sprint-2` branch (working tree ahead of `83c446f`), running
the prototype locally with `npm run dev`, a real Neon Postgres database, and Stripe in
test mode. This supplements the automated Vitest suite (`npm run test:run`, 27/27
passing) with an actual end-to-end walkthrough, including a real Stripe Checkout
payment and a direct query of the resulting database rows — closing the specific gap
flagged in `docs/sprint-2-prototype/manual-verification.md` ("webhook signature-verified
event-acceptance path... not re-verified live... Stripe CLI isn't installed").

## Actions performed / expected / observed

### 1. Storefront reads from the database

- **Action:** `GET /` in a browser, after seeding the database (`npm run db:seed`).
- **Expected:** Same three products as the old hardcoded module (Tidepool Mug, Desert
  Light Bowl, Moon Vase), now served from Postgres via `getProducts()`.
- **Observed:** Matched. All three rendered with correct titles, descriptions, images,
  and prices.

### 2. Full buy flow with a real Stripe test payment (product 1)

- **Action:** Clicked "Buy" on the Tidepool Mug, completed Stripe's hosted Checkout
  page with the test card `4242 4242 4242 4242` (exp `12/34`, CVC `123`, ZIP `94103`).
- **Expected:** Buy → real `checkout.stripe.com` session for the correct item/price →
  after payment, `/checkout/success` shows "Order confirmed."
- **Observed:** Matched. Landed on `/checkout/success?session_id=cs_test_...` showing
  "Order confirmed — Thanks — your Tidepool Mug is confirmed."
- **Gap found:** at this point, `STRIPE_WEBHOOK_SECRET` in `.env.local` was present as a
  key but effectively empty (a stale/placeholder value, not a real signing secret) —
  meaning `/api/webhooks/stripe` would reject any real webhook with `400` regardless of
  what Stripe sent, and no order was persisted for this first purchase. See "Issues
  found" below.

### 3. Closing the webhook gap: Stripe CLI

- **Action:** Installed the Stripe CLI (`brew install stripe/stripe-cli/stripe`), ran
  `stripe login` (interactive; performed by the developer, not automated), then started
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe` in the background.
  This printed a real `whsec_...` signing secret, which was written into
  `STRIPE_WEBHOOK_SECRET` in `.env.local`, followed by a dev-server restart to pick it
  up.
- **Observed side effect:** `brew install`'s automatic dependency cleanup (`autoremove`)
  uninstalled an unrelated, apparently-unused Homebrew `node` formula as part of the
  same run. Verified immediately afterward that this did not affect the working
  toolchain — `node`/`npm`/`npx` all still resolved correctly via the project's actual
  Node install (`nvm`, `v22.22.1`), and `npm run test:run` still passed 27/27. Flagged
  here because an incidental system-level side effect from installing a CLI dependency
  is exactly the kind of thing a verification pass should catch and confirm, not assume
  away.

### 4. Full buy flow with a real Stripe test payment, webhook forwarding live (product 2)

- **Action:** Clicked "Buy" on the Desert Light Bowl, completed Checkout with the same
  test card, while `stripe listen` was running.
- **Expected:** Same successful checkout/confirmation as before, and this time a real
  `checkout.session.completed` event delivered to `/api/webhooks/stripe`, verified, and
  persisted.
- **Observed:** Matched, including the webhook. `stripe listen`'s log showed
  `checkout.session.completed [evt_1TuhOc...] --> ... <-- [200] POST
  http://localhost:3000/api/webhooks/stripe`. Querying the database directly afterward
  confirmed:

  ```json
  // orders
  {
    "id": 1,
    "stripeCheckoutSessionId": "cs_test_a1nDwdxAkzDadhrSCXZByoTcX4NmF90yUJyw05HkuTC7iDI9cyIbIp73pV",
    "status": "paid",
    "customerEmail": "test-buyer@example.com",
    "amountTotalInCents": 5800,
    "createdAt": "2026-07-18T23:11:50.737Z"
  }
  // order_items
  {
    "id": 1,
    "orderId": 1,
    "productId": "desert-bowl",
    "quantity": 1,
    "unitPriceInCents": 5800
  }
  ```

  Session id, amount ($58.00), email, product, and quantity all match what was actually
  purchased in the browser — not just "the route returned 200," but the correct row,
  with the foreign key (`order_items.order_id` → `orders.id`) populated correctly.

### 5. Automated suite

- **Action:** `npm run test:run`.
- **Expected:** All tests passing, including the rewritten webhook/data-layer tests
  that now mock `@/lib/db` instead of asserting on the old `console.log`.
- **Observed:** Matched. 8 test files, 27/27 tests passed.

### 6. Build

- **Action:** `npm run build`.
- **Expected:** Production build succeeds; `/` statically prerenders against the real
  database at build time without crashing on the lazily-initialized DB client.
- **Observed:** Matched. `/` built as a static route (`○`), `/api/webhooks/stripe` and
  `/checkout/success` as dynamic (`ƒ`), as expected for a server-action/DB-backed home
  page and per-request routes.

## Issues found

1. **`STRIPE_WEBHOOK_SECRET` was stale/empty in `.env.local` at the start of this
   pass**, meaning the very first real webhook delivery attempt (Action 2) would have
   silently failed the `400` "missing secret" guard rather than persisting an order.
   This wasn't a code defect — `app/api/webhooks/stripe/route.ts` behaved exactly as
   designed, correctly rejecting a request it couldn't verify — but it's a real
   environment gap that would have made order persistence silently not work in local
   dev. **Fixed** as part of this pass by installing the Stripe CLI and writing a real
   signing secret from `stripe listen`; documented in `prototype/README.md` so it
   doesn't recur.
2. **Installing the Stripe CLI via Homebrew triggered an unrelated `autoremove` that
   uninstalled a Homebrew `node` formula.** Not a defect in this project, but worth
   recording: verified immediately that the active Node toolchain (nvm-managed) and the
   full test suite were unaffected before continuing. No action needed, but a good
   reminder to re-verify the toolchain after any `brew install`.
3. **Carried over from Sprint 2, still open:** `/checkout/success` throws an unhandled
   500 on an invalid or expired `session_id` instead of showing a message. Unrelated to
   persistence, not touched this sprint — see `docs/sprint-2-prototype/manual-verification.md`.

## Engineering conclusion

The persistence slice works end-to-end with real infrastructure, not just mocked
tests: a real Stripe test payment, forwarded through Stripe's actual webhook delivery
via the CLI (not a hand-crafted signed payload), produced the correct `orders` and
`order_items` rows with the right foreign key relationship. The one real environment
gap found (an unconfigured local webhook secret) was caught precisely because this pass
insisted on watching the row land in Postgres rather than trusting a `200` response —
mirroring the Sprint 2 lesson that mocked-test coverage and a live, observed run are
different claims. That gap is now fixed and documented so it doesn't reappear for the
next person who clones this repo.
