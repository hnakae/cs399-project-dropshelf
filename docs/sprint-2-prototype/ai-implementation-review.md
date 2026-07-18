# AI Implementation Review — Sprint 2

## AI implementation assistance

AI (Claude) wrote the Sprint 2 prototype: the creator profile and product-listing UI
(`app/page.tsx`, `components/creator-profile.tsx`, `components/product-card.tsx`), the
Stripe Checkout integration (`lib/actions.ts`, `lib/stripe.ts`), the webhook handler
(`app/api/webhooks/stripe/route.ts`), the `/checkout/success` confirmation page, and
the Vitest + React Testing Library suite in `__tests__/` (25 tests). AI also drafted
this documentation set (`docs/sprint-2/architecture.md`,
`docs/sprint-2/manual-verification.md`, this file) and reorganized the Sprint 1 docs
into `docs/sprint-1/` in a later session focused on closing gaps against the assignment
checklist.

Where I directed the implementation, rather than leaving it to AI's default:

- **Checkout flow.** I had AI use Stripe's hosted Checkout via server-side redirect
  (`stripe.checkout.sessions.create` → `redirect(session.url)`) instead of embedding
  Stripe Elements client-side, and kept it to one product per purchase — in line with
  the single-creator, one-item-at-a-time scope from Sprint 1.
- **Webhook security.** I required the webhook route to verify the `stripe-signature`
  header with `stripe.webhooks.constructEvent` against `STRIPE_WEBHOOK_SECRET` before
  trusting any event, and to return 400 if the signature or secret is missing, instead
  of trusting the raw POST body.
- **Payment confirmation.** I asked for the `/checkout/success` page to re-verify the
  order server-side by retrieving the Checkout Session from Stripe and checking
  `payment_status === "paid"`, rather than treating arrival at the success URL as proof
  of payment.
- **Storefront content and visual direction.** The single-creator ceramics storefront
  concept, the product copy, and the color/typography system in `globals.css` (glaze
  palette, serif display + mono labels) were my direction; AI translated that into the
  Tailwind theme tokens and components.
- **Documentation structure.** When AI flagged that `docs/architecture.md`,
  `docs/manual-verification.md`, and `docs/ai-implementation-review.md` didn't exist
  at the paths the assignment specifies, and that the Sprint 1 docs lived under
  `docs/DropShelf/` instead, I directed the reorganization into `docs/sprint-1/` and
  `docs/sprint-2/` rather than either of the two alternatives AI proposed (a flat
  `docs/` matching the assignment's literal paths exactly, or leaving Sprint 1 in place
  and bolting the new files on) — I wanted Sprint 1 and Sprint 2 artifacts kept
  visibly separate as the project evolves across sprints.

## AI engineering review

In a later session, I asked AI to review the Sprint 2 branch against the assignment's
required-deliverables checklist rather than assuming the earlier work was complete. AI
found the branch was missing `docs/manual-verification.md` and
`docs/ai-implementation-review.md` entirely, that `docs/architecture.md` was still the
untouched Sprint 1 sketch, that `main` hadn't been merged with `sprint-2`, and that the
README linked to doc paths that didn't exist. AI also flagged the docs-location
mismatch above.

I then had AI go a step further than just writing the missing docs: actually run the
app and manually exercise the buy flow — starting the dev server, driving a real
Stripe Checkout session through to payment with Stripe's test card
`4242 4242 4242 4242` via browser automation, and curling the webhook route and
success-page edge cases directly — instead of writing `docs/manual-verification.md`
from assumptions about what the code should do. That pass surfaced a real defect: an
invalid or expired `session_id` on `/checkout/success` throws an unhandled exception
(`HTTP 500`) instead of showing a friendly message, because
`stripe.checkout.sessions.retrieve` isn't wrapped in a try/catch. Full detail is in
[`manual-verification.md`](./manual-verification.md).

## Accepted suggestion

I accepted AI's original webhook-signature-verification design over a simpler "trust
the POST body" approach — verifying against `STRIPE_WEBHOOK_SECRET` before processing
any event is a small amount of extra code for a real security property (a mocked or
replayed webhook can't fake an order). I also accepted the `docs/sprint-1/` /
`docs/sprint-2/` reorganization AI proposed as one of three options, and accepted its
recommendation to actually run the app for manual verification rather than writing
the verification doc from a read of the source alone.

## Rejected / postponed suggestion

When AI found the `/checkout/success` 500 bug during manual verification, it could
have just fixed it inline while it was in the code. I told it not to — I wanted the
gap logged as a finding in `manual-verification.md` first, with the fix tracked as a
deliberate follow-up commit, rather than have a "verification" pass quietly turn into
an undocumented code change. This keeps the verification record honest: what was
actually observed running, versus what was patched afterward. Separately, the Sprint 1
architecture sketch's suggestion of a Postgres/SQLite-backed data layer and an admin UI
was postponed again in Sprint 2 — `lib/data.ts` is still a hardcoded module — because
building real persistence wasn't necessary to demonstrate the checkout feature slice
this sprint; it's tracked as an open question in `docs/sprint-2/architecture.md` for
Sprint 3.

## Manual verification after AI review

Every claim in this document and in `manual-verification.md` was checked by actually
running the app, not by re-reading the code and assuming it worked:

- Started `npm run dev` and loaded the storefront in a real browser.
- Completed a real Stripe test-mode Checkout session end-to-end (redirect to
  `checkout.stripe.com`, paid with `4242 4242 4242 4242`, redirected back) and
  confirmed "Order confirmed" rendered.
- Sent direct `curl` requests at `/api/webhooks/stripe` to confirm the missing-signature
  and missing-secret guards return 400 as coded.
- Sent direct requests at `/checkout/success` for the no-`session_id` and
  invalid-`session_id` cases, which is what surfaced the unhandled 500.
- Ran `npm run test:run` and confirmed all 25 automated tests still pass.

Full results, including what was **not** re-verified live (the webhook's
signature-accepted path, which requires the Stripe CLI's `stripe listen` and wasn't
available in this environment), are in `manual-verification.md`.

## Engineering responsibility statement

All final decisions — what to build, what to cut, which stack to use, when to accept
an AI-found defect versus have AI fix it immediately, and how to structure the
documentation — were mine. AI implemented code and docs faster than I would have
alone, and in this review pass it caught a real bug by actually running the app rather
than by inspection, but it did not choose the project, decide the architecture
tradeoffs (e.g., hardcoded data vs. a database this sprint), or get to silently patch
what it found. I'm the one accepting this branch as ready to merge, with the known
`session_id` gap tracked rather than hidden.
