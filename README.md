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
- [x] AI contribution documented (`AI_Contribution.md`)

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

**Completed feature slice:** the product catalog and order history are now real,
durable data instead of a hardcoded module and a `console.log`. A completed Stripe
purchase leaves a permanent, queryable record — order and line item — in Postgres.

## AI Review — Stripe Checkout Feature (Sprint 2)

AI (Claude) wrote the Sprint 2 prototype: the creator profile and product-listing UI, the Stripe Checkout integration (`lib/actions.ts`, `lib/stripe.ts`), the webhook handler (`app/api/webhooks/stripe/route.ts`), and the `/checkout/success` confirmation page.

Where I directed the implementation, rather than leaving it to AI's default:

- **Checkout flow.** I had AI use Stripe's hosted Checkout via server-side redirect (`stripe.checkout.sessions.create` → `redirect(session.url)`) instead of embedding Stripe Elements client-side, and kept it to one product per purchase — in line with the single-creator, one-item-at-a-time scope from Sprint 1.
- **Webhook security.** I required the webhook route to verify the `stripe-signature` header with `stripe.webhooks.constructEvent` against `STRIPE_WEBHOOK_SECRET` before trusting any event, and to return 400 if the signature or secret is missing, instead of trusting the raw POST body.
- **Payment confirmation.** I asked for the `/checkout/success` page to re-verify the order server-side by retrieving the Checkout Session from Stripe and checking `payment_status === "paid"`, rather than treating arrival at the success URL as proof of payment.
- **Storefront content and visual direction.** The single-creator ceramics storefront concept, the product copy, and the color/typography system in `globals.css` (glaze palette, serif display + mono labels) were my direction; AI translated that into the Tailwind theme tokens and components.

What I verified before accepting the code:

- Ran the full flow locally with `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and Stripe's test card `4242 4242 4242 4242`, confirming checkout → webhook → success page all fire correctly.
- Confirmed `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are only read from `.env.local`, which is gitignored, and never hit the client bundle.

Known gap I'm accepting for now: the webhook only logs `checkout.session.completed` (see the `console.log` in `route.ts`) and doesn't persist an order record yet. That's deferred to a later sprint, not an oversight.

## Expected Behavior

- Visiting `/` shows one creator's profile and a grid of their products.
- Clicking "Buy" on a product redirects to a real Stripe-hosted Checkout session for
  that single item.
- Paying with a Stripe test card redirects back to `/checkout/success`, which
  independently re-checks the payment status with Stripe and shows "Order confirmed"
  only if it actually succeeded.
- `POST /api/webhooks/stripe` verifies Stripe's signature before trusting any event;
  requests without a valid signature are rejected with `400`. On a verified
  `checkout.session.completed` event it persists an `orders` + `order_items` row in
  Postgres (Sprint 3) rather than only logging it.
- **Known gap:** `/checkout/success` does not yet handle an invalid or expired
  `session_id` gracefully — it throws an unhandled 500 instead of showing a message.
  See `docs/sprint-2-prototype/manual-verification.md` for detail; tracked as a
  follow-up, not fixed yet.

## Intentionally Deferred Features

Carried over from `docs/sprint-1-definition/project-vision.md`, updated after Sprint 3:

- Creator authentication, account management, or an admin UI.
- Multi-creator support / dynamic `[creator]` routing — this prototype is scoped to a
  single hardcoded creator (the `creator` object in `lib/data.ts`; only the product
  catalog and orders moved to the database in Sprint 3).
- Digital file delivery, order history UI, search, or discovery — order data is now
  persisted (Sprint 3), but there's no page that reads it back yet.

Resolved in Sprint 3 (previously listed here as deferred):

- ~~Persistence — creator/product data is a hardcoded module.~~ Product data now lives
  in Postgres; see `docs/sprint-3-persistence/architecture.md`.
- ~~Order records — the webhook only logs `checkout.session.completed`.~~ It now
  persists an `orders` + `order_items` row.

## Project Documents

- [docs/sprint-1-definition/project-vision.md](docs/sprint-1-definition/project-vision.md) — problem, intended users, goals, initial scope
- [docs/sprint-1-definition/requirements.md](docs/sprint-1-definition/requirements.md) — functional, data, and non-functional requirements
- [docs/sprint-1-definition/architecture.md](docs/sprint-1-definition/architecture.md) — Sprint 1 architecture sketch
- [docs/sprint-2-prototype/architecture.md](docs/sprint-2-prototype/architecture.md) — architecture as actually built, and how it diverged from the sketch
- [docs/sprint-2-prototype/manual-verification.md](docs/sprint-2-prototype/manual-verification.md) — actions performed, expected vs. observed results, issues found
- [docs/sprint-2-prototype/ai-implementation-review.md](docs/sprint-2-prototype/ai-implementation-review.md) — AI's role, what was accepted/rejected, and post-review verification
- [docs/sprint-3-persistence/architecture.md](docs/sprint-3-persistence/architecture.md) — architecture updated for the persistence layer (database, schema, webhook writes)
- [docs/sprint-3-persistence/manual-verification.md](docs/sprint-3-persistence/manual-verification.md) — end-to-end verification of a real Stripe payment persisting to Postgres
- [docs/sprint-3-persistence/ai-implementation-review.md](docs/sprint-3-persistence/ai-implementation-review.md) — AI's role, what was accepted/rejected/directed, and post-review verification
- [AI_Contribution.md](AI_Contribution.md) — how AI was used in Sprint 1

## Setup Notes

Stack: Next.js (full-stack, no separate server) with the Stripe SDK and a Postgres
database (Neon, via the Vercel Marketplace) accessed through Drizzle ORM. See "Getting
Started" above for install and run instructions, and `prototype/README.md` for the
database setup and automated test suite.
## Sprint-1-Target 

*Use Git Branches: Sprint-1-Branch*
By the end of Sprint 1, your project evidence should include: README.md project-vision.md requirements.md architecture.md a private GitHub repository early commits that show your project definition work
