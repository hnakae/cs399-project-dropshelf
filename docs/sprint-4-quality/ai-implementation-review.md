# AI Implementation Review — Sprint 4

## AI implementation assistance

AI (Claude) implemented the Sprint 4 work: Clerk authentication (the `proxy.ts`
rewrite, `lib/admin.ts`, `<ClerkProvider>`, the sign-in page, `components/nav.tsx`),
full product CRUD (the `isArchived` column, `lib/db/validation.ts`,
`lib/products-actions.ts`, the `/admin/products` pages), the order cancel-and-refund
action (`lib/orders-actions.ts`, `components/cancel-order-button.tsx`), the
accompanying test suite (`8a40c4b`), the `/checkout/success` invalid-session fix
(`acdc2cd`), and this documentation set.

Where I directed the implementation, rather than leaving it to AI's default:

- **Admin model: any signed-in Clerk user counts as admin.** Confirmed explicitly as a
  scope decision for a single-shop-owner app with one account — no RBAC, no
  `publicMetadata` roles. AI's implementation notes flagged this as something to
  confirm rather than defaulting to it.
- **Product delete: soft delete via a new `isArchived` column**, applied with
  `npm run db:push` rather than a Drizzle migration file — this project has never used
  migration files, and I didn't want to introduce that tooling for one boolean column
  when the existing convention already covers it.
- **Scope grew beyond the kickoff's "narrowly scoped Update or Delete" ask, at my
  explicit request** — full Clerk auth, full product CRUD, and an order cancel/refund
  action, not the smaller original scope. This was a deliberate expansion I asked for,
  not scope creep AI introduced on its own; see `docs/sprint-4-quality/plan.md`.
- **Order "cancel for refund" is a status transition, not general field-level order
  editing.** I confirmed this framing up front so the feature stayed scoped to what the
  sprint actually needed, rather than growing into a general order-editing UI.

## AI engineering review

Mid-sprint, Clerk logged a runtime deprecation warning that `createRouteMatcher`-based
middleware-only route gating is being replaced by per-resource checks, since
path-matching can diverge from actual Next.js routing. AI didn't ignore this as noise —
it traced the warning to the fact that `/orders/page.tsx` relied solely on the
`proxy.ts` gate, and fixed it by adding a direct `requireAdmin()` call there, matching
the pattern `/admin/*` already had via its layout. This is the same category of
discipline Sprint 3's review flagged (not stopping at "the code looks right"): a
warning surfaced during live testing was investigated and fixed rather than deferred.

Also caught: `@clerk/nextjs@7` (Core 3) has dropped the `<SignedIn>`/`<SignedOut>`
components the original plan assumed. AI confirmed this by inspecting the installed
package's actual exports (`node_modules/@clerk/nextjs`) rather than trusting cached
skill documentation, and used the current replacement (`<Show when="...">`) instead.

## Accepted suggestion

I accepted keeping the `confirm()` dialog in `CancelOrderButton` — the one deliberate
Client Component exception in an otherwise server-action-only app — because a
real-money-moving action (an actual Stripe refund) justified breaking that consistency
for a confirmation gate. I also accepted reading `payment_intent` directly off the
retrieved Checkout Session rather than a second, separate lookup, after AI confirmed via
the Stripe docs that the field is present on the session by default and handling both
its string and expanded-object shape was sufficient.

## Rejected / postponed suggestion

I did not have AI build a multi-item cart this sprint, even though the API research for
it is done (Stripe's per-line-item metadata shape, the webhook's `listLineItems`
expansion, `sql.join` for a bulk insert) — a real cart is new client-side state and UI,
not a small tweak, so it's logged as deferred work rather than built partially under
this sprint's time pressure. I also did not have AI close the gap flagged below (the
admin model accepting any signed-in user, dependent on a Clerk Dashboard setting) — that
was consciously left to Sprint 5 rather than folded in here, since creating the admin
account and disabling public sign-up are the student's own manual steps, not something
to script around.

The original kickoff scope's `/checkout/success` bug fix was initially deferred in
favor of the larger CRUD/Clerk body of work, then picked back up and actually fixed
before the sprint closed — logged honestly in `kickoff.md` as "superseded, then
un-deferred," not silently dropped.

## Manual verification after AI review

Every claim in this document and in `manual-verification.md` was checked against a
running app, not just re-read in the code:

- Confirmed live, against `npm run dev`, that `/orders` and `/admin/products` redirect
  to `/sign-in` when signed out, and that `/sign-in` itself renders cleanly.
- Confirmed the Stripe webhook route is unaffected by the Clerk middleware rewrite.
- Confirmed `/checkout/success?session_id=<bogus>` returns `200` with "Session not
  found" instead of crashing into a 500.
- Ran `npm run test:run` (56/56 passing) and `npm run build` (all new routes produced)
  after every stage of the work.
- Did **not** claim the signed-in admin flows (product CRUD, refund) were manually
  verified, because they weren't — that's logged as open in `manual-verification.md`,
  not glossed over.

## Engineering responsibility statement

All final decisions — the admin model's scope, soft delete over hard delete, treating
order cancellation as a status transition rather than general editing, and what to defer
to Sprint 5 — were mine, made after AI presented the tradeoffs rather than by taking its
first recommendation. AI implemented Clerk auth, full CRUD, and the refund action faster
than I would have alone, and in this review pass it caught two real, live-surfaced gaps
(the Clerk route-matcher deprecation, and the stale `<SignedIn>`/`<SignedOut>` API) by
checking actual runtime behavior and actual installed-package exports rather than
assuming either was still accurate. It did not choose to close the admin-identity gap
unilaterally, either — that's tracked openly as unresolved in `architecture.md` rather
than implemented ad hoc and left undocumented. I'm the one accepting this branch as
ready for the Sprint 4 Engineering Demonstration, with the admin-identity gap, the
refund/status-write ordering, and the pending signed-in walkthrough all tracked as open
rather than hidden.
