# DropShelf

A direct-to-consumer storefront platform for independent creators to sell digital and physical products without a marketplace middleman.

## Getting Started

```bash
cd prototype
npm install
```

Create `prototype/.env.local` (gitignored, not included in the repo) with:

```
STRIPE_SECRET_KEY=       # test-mode secret key from https://dashboard.stripe.com/test/apikeys
STRIPE_WEBHOOK_SECRET=   # from `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DATABASE_URL=            # Postgres (Neon via Vercel Marketplace) — see prototype/README.md
ORDERS_VIEW_PASSWORD=    # Basic Auth password for the /orders view — see prototype/README.md
```

`STRIPE_SECRET_KEY` and `DATABASE_URL` are required — the app throws on startup without
`STRIPE_SECRET_KEY` (`lib/stripe.ts`), and the storefront/checkout/webhook all read from
Postgres now (`lib/db/`). `STRIPE_WEBHOOK_SECRET` is only needed to receive webhook
events locally via the [Stripe CLI](https://docs.stripe.com/stripe-cli); the buy →
checkout → confirmation flow works without it, but order persistence does not.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Buy a product with Stripe's test
card `4242 4242 4242 4242` (any future expiry, any CVC, any ZIP).

See [`prototype/README.md`](prototype/README.md) for the automated test suite and more
detail on the environment variables.

# CS-399-Project-DropShelf

## author: <hnakae@uoregon.edu>

## How the Course Moves

This course uses a five-sprint sequence. Each sprint adds project evidence and gives you another opportunity to practice the engineering cycle: Define, Generate, Analyze, Revise, Verify, and Explain.

## Overview

DropShelf lets individual creators set up a public profile page, list products for sale, and accept payments directly from buyers via Stripe. The goal is a lightweight alternative to large marketplaces — creators own their storefront, keep more revenue, and sell on their own terms.

## Sprint 1 Progress

Sprint 1 deliverables — project definition:

- [x] Repository initialized with commit history on `sprint-1` branch
- [x] Project vision drafted (`docs/sprint-1-definition/project-vision.md`)
- [x] Requirements defined (`docs/sprint-1-definition/requirements.md`)
- [x] Initial architecture sketched (`docs/sprint-1-definition/architecture.md`)
- [x] AI contribution documented (`docs/sprint-1-definition/AI_Contribution.md`)

No working code yet — prototype begins in Sprint 2.

## Sprint 2 Progress

Sprint 2 deliverables — working prototype:

- [x] Next.js app scaffolded (`prototype/`)
- [x] Creator profile + product listing UI
- [x] Stripe Checkout (buy flow) and webhook handler
- [x] Automated test suite (Vitest + React Testing Library) — 25 tests passing, covers checkout action, webhook signature verification, and success-page confirmation
- [x] Architecture updated to reflect the actual build (`docs/sprint-2-prototype/architecture.md`)
- [x] Manual verification pass, including a real Stripe test payment (`docs/sprint-2-prototype/manual-verification.md`)
- [x] AI review of the Stripe feature documented (below and in `docs/sprint-2-prototype/ai-implementation-review.md`)

**Completed feature slice:** a buyer can browse a single creator's storefront, buy a
product through a real Stripe Checkout session, and land on a confirmation page that
re-verifies the payment with Stripe rather than trusting the redirect.

## Sprint 3 Progress

Sprint 3 deliverables — persistence and integration:

- [x] Postgres database provisioned (Neon, via the Vercel Marketplace) and linked to the project
- [x] Drizzle ORM schema (`products`, `orders`, `order_items`) replacing the hardcoded `lib/data.ts` array
- [x] Storefront and checkout action read the product catalog from the database
- [x] Stripe webhook persists an order + order line item on `checkout.session.completed`, instead of only logging it
- [x] Automated test suite updated for the database-backed data layer and webhook persistence — 27 tests passing
- [x] Manual, end-to-end verification with a real Stripe test payment forwarded through the Stripe CLI, confirmed by querying the resulting rows in Postgres (`docs/sprint-3-persistence/manual-verification.md`)
- [x] Architecture updated to reflect the persistence layer (`docs/sprint-3-persistence/architecture.md`)
- [x] AI review of the persistence work documented (`docs/sprint-3-persistence/ai-implementation-review.md`)
- [x] Webhook order write made atomic — a single SQL statement instead of two unguarded inserts (`docs/sprint-3-persistence/updates/webhook-atomic-write.md`)
- [x] Order-history view (`/orders`), reading live from Postgres, gated by a shared-secret Basic Auth check (`docs/sprint-3-persistence/updates/orders-view.md`, `orders-view-auth-gate.md`)

**Completed feature slice:** the product catalog and order history are now real,
durable data instead of a hardcoded module and a `console.log`. A completed Stripe
purchase leaves a permanent, queryable record — order and line item, written
atomically — in Postgres, and `/orders` makes that history visible and verifiable
without dropping into a database GUI.

## Sprint 4 Progress

Sprint 4 deliverables — quality and persistence completion (in progress):

- [x] Kickoff scope, branch, and Canvas submission fields drafted (`docs/sprint-4-quality/kickoff.md`)
- [x] Staged implementation plan written for Clerk auth, full product CRUD, order
      cancel/refund, and test coverage, with per-item test annotations
      (`docs/sprint-4-quality/plan.md`)
- [x] `drizzle-zod` schema validation added (`lib/db/validation.ts`) — Zod
      insert/select schemas derived directly from the Drizzle table
      definitions, so validation can't drift from the DB schema
- [ ] Clerk authentication, replacing the shared-password Basic Auth gate on `/orders`
- [ ] Admin product management (create/edit/archive) with validated input
- [ ] Order cancel-and-refund action (Stripe refund + status update)
- [ ] Automated test coverage for the above
- [ ] Sprint 4 Canvas submission fields finalized

**In progress:** see `docs/sprint-4-quality/plan.md` for the staged rollout
(Clerk auth → product CRUD → order refunds → tests). Nothing beyond the
groundwork above has landed yet.
