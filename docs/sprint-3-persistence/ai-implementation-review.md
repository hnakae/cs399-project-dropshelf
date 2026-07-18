# AI Implementation Review — Sprint 3

## AI implementation assistance

AI (Claude) implemented the Sprint 3 persistence layer: the Drizzle schema and client
(`lib/db/schema.ts`, `lib/db/index.ts`, `lib/db/seed.ts`, `drizzle.config.ts`), the
migration of `lib/data.ts` from a hardcoded array to database queries, the checkout
action's new session metadata (`lib/actions.ts`), the webhook's order-persistence logic
(`app/api/webhooks/stripe/route.ts`), the corresponding test rewrites in `__tests__/`,
the Vercel/Neon provisioning steps, and this documentation set.

Where I directed the implementation, rather than leaving it to AI's default:

- **SQL over NoSQL.** AI proposed this and explained why (the order → order_items →
  products shape is relational, not document-shaped), but I confirmed it rather than
  taking it as given — this is the kind of decision the course explicitly wants me able
  to defend live, not just accept.
- **Drizzle over Prisma.** AI's first recommendation was Drizzle. I pushed back and
  asked specifically *why* over Prisma, since Prisma is what most tutorials I'd seen
  use — I wanted the actual tradeoff (schema-as-TypeScript vs. a separate DSL and
  codegen step, Prisma's more explicit `@relation` syntax vs. Drizzle's closer mapping
  to raw SQL) rather than a default. After that comparison I picked Drizzle, because
  "closer to the SQL it actually generates" mattered more to me for being able to
  explain this in the demo than Prisma's more diagram-like relation syntax.
- **Provisioning path.** I had AI use the Vercel Marketplace's managed Neon integration
  (`vercel integration add neon`) rather than provisioning a database directly through
  Neon's own dashboard or CLI — this keeps the database's environment variables tied to
  the same Vercel project/deploy pipeline instead of a second, separately-managed
  credential set.
- **Metadata-based order correlation, not a second Stripe API call.** For linking a
  webhook event back to the specific product purchased, AI could have had the webhook
  call `stripe.checkout.sessions.retrieve` with `expand: ["line_items"]` to look up
  what was bought. Instead the checkout action attaches `productId`/`quantity`/
  `unitPriceInCents` as session `metadata` up front, so the webhook reads it directly
  off the event with no extra network round-trip. I accepted this because it's simpler
  and the one-item-per-purchase scope (unchanged from Sprint 2) makes flat metadata
  sufficient; it would need to change if line items become variable.
- **Idempotent webhook writes.** I required the `orders` insert to be
  `onConflictDoNothing` on the unique `stripe_checkout_session_id`, and the
  `order_items` insert to only happen if that insert actually produced a row — Stripe
  webhooks are explicitly not exactly-once delivery, so a redelivered event must not
  create a duplicate order. This was AI's proposal; I accepted it because it's the
  standard, well-known fix for this exact class of bug rather than something
  speculative.

## AI engineering review

Before treating persistence as done, I had AI actually run the full flow rather than
reason about the code in isolation: start the dev server, buy a product in a real
browser, and specifically check whether the resulting row existed in Postgres — not
just whether the HTTP response was `200`. That check surfaced a real environment gap:
`STRIPE_WEBHOOK_SECRET` was stale/empty locally, so the first live purchase's webhook
would have been silently rejected and no order would have been written, even though
every other part of the flow (checkout, payment, confirmation page) worked. AI didn't
stop at "the code looks right" — it installed the Stripe CLI, generated a working
secret, and re-ran the purchase to confirm the row actually landed, including checking
the exact fields (session id, amount, email, product, quantity, and the foreign key)
rather than just row-count. Full detail in `manual-verification.md`.

## Accepted suggestion

I accepted AI's `onConflictDoNothing`/duplicate-delivery handling in the webhook over a
simpler unconditional insert — Stripe's own docs are explicit that webhook delivery is
at-least-once, so treating it as at-most-once would have been a latent bug, not a
hypothetical one. I also accepted moving the DB client construction into a lazy
`getDb()` function instead of a module-level `const db = drizzle(...)`, because
Next.js evaluates top-level module code at build time and a database env var isn't
guaranteed to exist yet on a first deploy — this is a real Vercel/Neon-specific failure
mode, not defensive-programming-for-its-own-sake.

## Rejected / postponed suggestion

I did not have AI give `/checkout/success` a database read as part of this sprint, even
though the data now exists to support one — the webhook's delivery is asynchronous and
not guaranteed to land before the buyer's browser redirect does, so making the
confirmation page depend on the database would need a retry/fallback story I didn't
want to design under this sprint's time pressure. It's logged as an open question in
`architecture.md` for Sprint 4 rather than built partially. I also postponed giving the
`creator` object its own database table — there's exactly one creator, nothing writes
to it, and a single-row table wouldn't demonstrate anything relational; not worth the
scope this sprint.

## Manual verification after AI review

Every claim in this document and in `manual-verification.md` was checked by actually
running the app against real infrastructure, not by re-reading the code and assuming
it worked:

- Seeded the real database (`npm run db:seed`) and loaded the storefront in a browser,
  confirming all three products render from Postgres.
- Completed two real Stripe test-mode Checkout sessions end-to-end with the
  `4242 4242 4242 4242` test card.
- Installed and ran the Stripe CLI's `stripe listen` to forward real webhook events to
  the local server — closing the exact verification gap Sprint 2 flagged as
  unavailable in that environment.
- Queried the `orders` and `order_items` tables directly after the second purchase and
  confirmed the row's fields matched the actual purchase, not just that a row existed.
- Ran `npm run test:run` (27/27 passing) and `npm run build` (succeeds, `/`
  prerenders statically against the real database) after all code changes.
- Confirmed a `brew install` side effect (an unrelated Homebrew `node` formula being
  autoremoved) didn't break the working Node toolchain before continuing.

## Engineering responsibility statement

All final decisions — SQL over NoSQL, Drizzle over Prisma, the Marketplace provisioning
path, metadata-based order correlation, and what to defer to Sprint 4 — were mine,
made after AI presented the tradeoffs rather than by taking its first recommendation.
AI implemented the schema, the migration, the webhook logic, and the tests faster than
I would have alone, and in this review pass it caught a real environment gap (the stale
webhook secret) by insisting on watching the database row rather than trusting a `200`
response. It did not choose the architecture unilaterally or silently patch what it
found — the webhook-secret gap and the `brew`/Node side effect are both logged here
rather than fixed-and-forgotten. I'm the one accepting this branch as ready for the
Sprint 3 Engineering Demonstration, with the `/checkout/success` database-read question
and the pre-existing `session_id` 500 bug both tracked as open rather than hidden.
