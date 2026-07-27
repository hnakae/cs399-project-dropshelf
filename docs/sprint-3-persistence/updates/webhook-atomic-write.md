# Update — Webhook atomic write

Closes the gap `checkpoint.md` named as "Biggest remaining challenge" / "Next step":
`recordOrder()` in `app/api/webhooks/stripe/route.ts` did two separate inserts — `orders`,
then `order_items` — with no transaction wrapping them. A crash between the two
statements would leave an `orders` row with no matching `order_items` row, and nothing
downstream would notice.

## What changed

`recordOrder()` now does one Postgres statement instead of two:

```ts
await getDb().execute(sql`
  WITH inserted_order AS (
    INSERT INTO orders (stripe_checkout_session_id, status, customer_email, amount_total_in_cents)
    VALUES (${session.id}, ${session.payment_status}, ${session.customer_details?.email ?? null}, ${session.amount_total ?? 0})
    ON CONFLICT (stripe_checkout_session_id) DO NOTHING
    RETURNING id
  )
  INSERT INTO order_items (order_id, product_id, quantity, unit_price_in_cents)
  SELECT id, ${productId}, ${Number(quantity)}, ${Number(unitPriceInCents)}
  FROM inserted_order
`);
```

## Why a raw CTE instead of `db.transaction()`

The obvious fix for "two writes need to succeed or fail together" is a database
transaction. That wasn't available here: this project's Neon client uses
`drizzle-orm/neon-http` (the HTTP driver, chosen originally for its zero-config fit with
Vercel's serverless functions — see `architecture.md`), and `neon-http` has no
session/transaction support — calling `db.transaction()` on it throws `No transactions
support` at runtime.

A single Postgres statement is atomic by definition, with no separate transaction API
needed. The `WITH inserted_order AS (...)` CTE performs the `orders` insert first and
exposes its `id` (if a row was actually inserted) to the second `INSERT ... SELECT`,
all as one statement Postgres either fully applies or fully doesn't. There is no window
between the two writes for a crash to land in.

## Idempotency is preserved

The existing `ON CONFLICT (stripe_checkout_session_id) DO NOTHING` still does its job:
on a redelivered webhook (Stripe is at-least-once, not exactly-once), the `INSERT INTO
orders` produces zero rows, so `inserted_order` is empty, so the `order_items` insert's
`SELECT ... FROM inserted_order` also produces zero rows. A redelivered event is still a
complete no-op, not a partial or duplicate write.

## Verification

- `__tests__/api/webhooks/stripe/route.test.ts` rewritten to mock `db.execute` instead
  of the old `db.insert(...).returning()` chain; all 7 webhook tests pass.
- `npm run test:run` — 27/27 passing.
- `npm run build` — succeeds; no schema or type changes were needed since the same
  `orders`/`order_items` columns are used, just via `sql` instead of the query builder.

## Engineering judgment

**Accepted:** the single-CTE-statement approach over switching Neon drivers (e.g. to
`drizzle-orm/neon-serverless`, which does support `db.transaction()` over a WebSocket
connection) to get real transactions. Changing drivers would touch `lib/db/index.ts`
and the connection model for the whole app to fix one write path — disproportionate for
a two-statement write that a single parameterized SQL statement already solves cleanly.
If a third write ever needs to join this same atomic unit, that tradeoff should be
revisited.
