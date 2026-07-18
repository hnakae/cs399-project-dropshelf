# Engineering Demonstration 1 — Cheat Sheet (Sprint 3)

## Demo flow (~3 min)

1. Homepage — three products rendering from Postgres, not a hardcoded array.
2. Open `lib/db/schema.ts` — point at the three tables and the one-to-many + reference
   shape (`orders` → `order_items` → `products`).
3. Click Buy → real Stripe Checkout → pay with `4242 4242 4242 4242`.
4. Show the `stripe listen` terminal catching `checkout.session.completed` and the
   route returning `200`.
5. Run `npm run db:studio` (or a direct query) and show the new `orders`/`order_items`
   rows — session id, amount, and product all matching what was just bought.

## If asked "why SQL, not NoSQL"

The data is genuinely relational — an order has many line items, each pointing at a
product. That's foreign keys and joins by definition. A document store would mean
duplicating product data into every order or hand-rolling joins. Not a close call for
this schema.

## If asked "why Drizzle, not Prisma"

Both are legitimate. Drizzle's schema is plain TypeScript — no separate DSL file, no
codegen step — and maps closely to the SQL it actually generates, which mattered more
for being able to explain it live than Prisma's more diagram-like `@relation` syntax.

## If asked "how does an order actually get written"

The checkout action attaches the product id/quantity/price as Stripe session
`metadata` up front. The webhook reads that straight off the verified event — no
second Stripe API call — then does an idempotent insert (`onConflictDoNothing` on the
session id) so a redelivered webhook can't create a duplicate order.

## Known gaps to volunteer, not hide

This reads as engineering maturity, not weakness:

- `/checkout/success` still re-verifies against Stripe directly rather than reading the
  database back — the webhook is async and might not have landed yet, so a
  retry/fallback design was deferred rather than built half-finished.
- No order-history UI yet, though the data now exists to support one.
- A pre-existing Sprint 2 bug (unhandled 500 on an invalid `session_id`) is still open.

## Sprint 4 priorities, if asked

1. Fix the `session_id` 500.
2. Decide whether `/checkout/success` should read its own order back.
3. Minimal order-history view now that the data exists.

## Repo readiness

All three Sprint 3 docs are in `docs/sprint-3-persistence/` (architecture,
manual-verification, ai-implementation-review). Root `README.md` has a Sprint 3
checklist and fixed the stale sprint-1/sprint-2 doc links. 27/27 tests pass, `npm run
build` succeeds.
