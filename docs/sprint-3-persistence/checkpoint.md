# Sprint 3 Checkpoint — DropShelf

## Current Sprint 3 direction
Persistence. I replaced the hardcoded product catalog (`lib/data.ts`, a plain JS array)
with a real Postgres database, and rewired the Stripe webhook so a completed checkout
writes a durable order record instead of just a `console.log`.

## Why this direction matters
Sprint 2's checkout flow worked end-to-end against Stripe, but nothing about a
"purchase" survived the request that handled it — a completed payment left only a log
line that scrolled away. That made the core feature slice look real but not be real:
there was no way to answer "did this person pay," "how much," or "what did they buy"
after the fact, and the product catalog could only change by editing source code and
redeploying. Persistence is what turns the Sprint 2 demo into an actual store.

## Data or external capability
- **Read:** the product catalog (title, description, price, image) on every storefront
  load.
- **Write:** one order record and one order-line record per completed Stripe checkout,
  triggered by the `checkout.session.completed` webhook event.
- **Correlate:** the webhook needs to know *which* product/quantity/price a given Stripe
  session corresponds to — solved via Checkout Session `metadata` set at session-creation
  time, so the webhook reads it directly instead of making a second Stripe API call.

## Current design
Postgres, provisioned as Neon via the Vercel Marketplace integration (`vercel
integration add neon`) so `DATABASE_URL` is managed alongside the rest of the Vercel
project rather than a separate credential set. Drizzle ORM on top of it — chosen over
Prisma because its schema is plain TypeScript with no separate DSL file or codegen step,
and maps closely enough to the actual SQL that I can explain it directly in a demo. The
DB client (`lib/db/index.ts`) is constructed lazily (`getDb()`) rather than at module
load, since `next build` evaluates top-level code before `DATABASE_URL` is guaranteed to
exist.

## Data model or structure
Three tables (`lib/db/schema.ts`):

| Table | Key fields | Relationship |
|---|---|---|
| `products` | `id` (text PK, e.g. `"tide-mug"`), `title`, `description`, `price_in_cents`, `image_url` | referenced by many `order_items` |
| `orders` | `id` (serial PK), `stripe_checkout_session_id` (unique), `status`, `customer_email`, `amount_total_in_cents`, `created_at` | has many `order_items` |
| `order_items` | `id` (serial PK), `order_id` (FK → `orders.id`), `product_id` (FK → `products.id`), `quantity`, `unit_price_in_cents` | bridges orders ↔ products |

`order_items.unit_price_in_cents` deliberately duplicates `products.price_in_cents` — an
order should snapshot the price paid at purchase time, not a live reference that changes
if the product's price is edited later.

## Progress so far
- Wrote the Drizzle schema, lazy DB client, and an idempotent seed script
  (`npm run db:seed`).
- Migrated `lib/data.ts`'s `getProducts()`/`getProductById()` from an in-memory array to
  real queries.
- Rewrote `app/api/webhooks/stripe/route.ts` to insert an `orders` row and an
  `order_items` row on a verified `checkout.session.completed` event, with
  `onConflictDoNothing` on `stripe_checkout_session_id` so a redelivered webhook (Stripe
  is at-least-once, not exactly-once) doesn't create a duplicate order.
- Rewrote the affected test suite to mock `@/lib/db` instead of asserting on the old
  `console.log` behavior — 27/27 tests passing (`npm run test:run`).
- Ran two real Stripe test-mode purchases end-to-end locally, with the Stripe CLI
  (`stripe listen`) forwarding actual webhook deliveries, and queried Postgres directly
  afterward to confirm the exact row (session id, amount, email, product, quantity, and
  the `order_items.order_id → orders.id` foreign key) matched the real purchase — not
  just that the route returned `200`.
- Confirmed `npm run build` still succeeds, with `/` statically prerendering against the
  live database.
- Documented all of the above in `architecture.md`, `manual-verification.md`, and
  `ai-implementation-review.md` in this folder.

## What currently works
The full buy flow is real, not simulated: storefront reads products from Postgres, a
completed Stripe test payment triggers a verified webhook, and an `orders` +
`order_items` row lands with the correct data and foreign key — confirmed by direct
database query, twice, not just by trusting a `200` response.

## Biggest remaining challenge
The webhook does two separate inserts — `orders`, then `order_items` — without wrapping
them in a database transaction. If the process crashed between the two statements, the
database would be left with an order that has no line items, and nothing would notice.
It hasn't happened in testing, but it's a real gap between "works in the demo" and
"correct under failure," and it's the most concrete thing I know is unfinished rather
than just unverified.

## AI-assisted learning and engineering
I had Claude compare JSON files, SQLite, Postgres, and MongoDB specifically against my
project's actual data shape (an order with line items referencing products) rather than
in the abstract. That grounded the SQL-vs-NoSQL decision in a concrete argument I can
defend live — the data is relational (one order, many items, each referencing a
product), which is the textbook case for foreign keys and joins, not a case a document
store handles cleanly without either duplicating product data into every order or
hand-rolling joins.

## Engineering judgment
**Accepted:** AI's recommendation to make the webhook idempotent
(`onConflictDoNothing` on `orders.stripe_checkout_session_id`, and only inserting
`order_items` if that insert actually produced a row). I accepted this because Stripe's
own docs are explicit that webhook delivery is at-least-once — treating it as
exactly-once would have been a latent bug, not a hypothetical one.

**Rejected/postponed:** AI could have had `/checkout/success` read the order back from
my own database now that it's persisted there. I postponed this — the webhook fires
asynchronously and isn't guaranteed to land before the buyer's browser redirects to the
success page, so a database-backed confirmation page would need a retry/fallback story I
didn't want to design under this sprint's time pressure. It's logged as an open question
for Sprint 4 in `architecture.md` instead of being half-built now.

## Next step
Wrap the `orders` and `order_items` inserts in a single database transaction so a
mid-write crash can't leave an order with no items — the cheapest, most concrete fix
available before treating persistence as done, and the one gap in this sprint's work I
can name precisely rather than just flag as "future work."
