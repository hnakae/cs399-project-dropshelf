# Sprint 4 — Full CRUD, Clerk Auth, Refunds, Test Coverage

## Context

The Sprint 4 kickoff doc originally scoped a narrowly-scoped Update *or* Delete
capability. This plan deliberately goes further, at the student's request:
Clerk-based real authentication (replacing the shared-password Basic Auth gate
on `/orders`), full product CRUD (create/edit/archive), an order
cancel-and-refund action, Zod-validated/sanitized input via the `drizzle-zod`
schemas already added in `lib/db/validation.ts`, and test coverage for all of
it. Work lands in five independently-committable stages (A–E) so history stays
reviewable.

Two decisions were confirmed with the user before this plan was written:

1. **Admin model:** any signed-in Clerk user counts as admin (single
   shop-owner app — matches the current single-shared-password philosophy, no
   RBAC/roles).
2. **Product delete:** soft delete via a new `isArchived` column, applied with
   `npm run db:push` (this project has never used Drizzle migration files —
   every prior schema change went straight through `db:push`, so Stage B
   follows that existing convention rather than introducing one for a single
   boolean column).

Order "cancel for refund" is a status-transition admin action, not
general field-level order editing.

---

## Stage A — Clerk auth

- [ ] Provision Clerk: `vercel integration add clerk` (auto-provisions
      `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`), then
      `vercel env pull .env.local --yes`.
      **Tested by:** manual — `vercel env ls` shows the two keys present.
- [ ] Create the one admin user directly in the Clerk Dashboard; disable
      public sign-up in Clerk's Restrictions settings (no `/sign-up` route is
      shipped — deliberate, see plan rationale below).
      **Tested by:** manual — confirm dashboard restriction is set.
- [ ] `npm install @clerk/nextjs`.
      **Tested by:** `npm run build` succeeds with the import resolvable.
- [ ] Rewrite `proxy.ts`: `clerkMiddleware` + `createRouteMatcher(["/orders(.*)", "/admin(.*)"])`,
      broad `matcher` config (per Clerk convention — do NOT narrow the
      top-level matcher to just those paths, or the session handshake breaks
      on other routes). Removes the old Basic Auth / `ORDERS_VIEW_PASSWORD`
      block entirely.
      **Tested by:** manual — signed out, visiting `/orders` and any
      `/admin/*` path redirects to `/sign-in`; signed in, both load.
- [ ] Add `lib/admin.ts` exporting `requireAdmin()` (`await auth()`, throws if
      no `userId`) — used for defense-in-depth inside Server Actions, since
      proxy-level gating alone is only an "optimistic check" per the Next.js
      auth guide.
      **Tested by:** `__tests__/lib/admin.test.ts` (Stage D) — mocks
      `@clerk/nextjs/server`'s `auth`, asserts throw when signed out /
      resolve when signed in.
- [ ] Wrap `app/layout.tsx` body in `<ClerkProvider>`.
      **Tested by:** manual — no hydration errors in dev console; `<UserButton />` renders.
- [ ] Add `app/sign-in/[[...sign-in]]/page.tsx` using Clerk's `<SignIn />`.
      **Tested by:** manual — sign-in flow completes and redirects back.
- [ ] Update `components/nav.tsx` with `<SignedIn>/<SignedOut>` +
      `<UserButton />` / sign-in link.
      **Tested by:** manual visual check, both signed-in and signed-out states.
- [ ] Update `README.md` — replace `ORDERS_VIEW_PASSWORD` env docs with Clerk env vars.
      **Tested by:** N/A (docs only).

**Commit:** `feat: replace Basic Auth with Clerk authentication`

**Stage verification:** `npm run build`, `npm run lint`, `npm run test:run`
(existing suite must stay green), manual browser check of the signed-in/out
flows above.

---

## Stage B — Products CRUD

- [ ] Add `isArchived: boolean("is_archived").notNull().default(false)` to
      `products` in `lib/db/schema.ts`; apply with `npm run db:push`.
      **Tested by:** `__tests__/lib/data.test.ts` extension asserting
      `getProducts()` filters `isArchived = false` (mocked `getDb`, no real DB hit).
- [ ] Extend `lib/db/validation.ts`: refine `insertProductSchema` with real
      business rules (non-empty trimmed `title`/`description`, positive
      integer `priceInCents`, valid-URL `imageUrl`, slug-shaped `id`); add
      `updateProductSchema` via `createUpdateSchema`, omitting `id` and `isArchived`.
      **Tested by:** `__tests__/lib/db/validation.test.ts` (Stage D) — direct
      schema unit tests, no mocking needed.
- [ ] `lib/data.ts`: filter `getProducts()` to non-archived; add
      `getAllProductsIncludingArchived()` for the admin list. No change needed
      to `getProductById` or `getOrders()` — soft delete never removes the
      row, so historical order joins keep resolving titles.
      **Tested by:** `__tests__/lib/data.test.ts`.
- [ ] New `lib/products-actions.ts` (kept separate from buyer-facing
      `lib/actions.ts` so the trust boundary is visible by filename):
      `createProduct`, `updateProduct`, `archiveProduct` — each calls
      `requireAdmin()` first, validates via the schemas above, calls
      `revalidatePath("/admin/products")` + `revalidatePath("/")`.
      **Tested by:** `__tests__/lib/products-actions.test.ts` (Stage D) —
      mocks `@/lib/admin` and `@/lib/db`; asserts admin-check runs before any
      DB call, and bad input is rejected before any DB call.
- [ ] New `app/admin/layout.tsx` — single shared `requireAdmin()` call for all
      admin pages (does not replace the per-action checks — Server Actions
      are independently reachable).
      **Tested by:** manual — visiting any `/admin/*` page while signed out redirects.
- [ ] New `app/admin/products/page.tsx` (list via
      `getAllProductsIncludingArchived()`, Edit link + inline Archive form per row),
      `app/admin/products/new/page.tsx` (create form),
      `app/admin/products/[id]/edit/page.tsx` (edit + archive forms,
      `notFound()` if missing) — plain Server Components + native
      `<form action={serverAction}>`, matching the existing checkout-button idiom.
      **Tested by:** manual only (matches this repo's existing precedent of
      not unit-testing plain fetch-and-render pages — see Stage D notes).
- [ ] `components/nav.tsx` — add `/admin/products` link inside `<SignedIn>`.
      **Tested by:** manual visual check.
- [ ] `README.md` — note archiving behavior in the Database section.

**Commits (split for reviewability):**

1. `feat: add product archiving and refined create/update validation schemas`
   (schema.ts, validation.ts, data.ts)
2. `feat: add admin product management UI and actions`
   (products-actions.ts, app/admin/**, nav.tsx, README.md)

**Stage verification:** `npm run db:push`; manual create → appears on `/` and
admin list; edit → catalog reflects it; archive → disappears from `/` but
stays visible (marked archived) in `/admin/products`; place a test order for a
product, archive it, confirm `/orders` still shows its title. `npm run test:run`, `npm run lint`.

---

## Stage C — Order cancel/refund

- [ ] New `lib/orders-actions.ts`: `cancelOrder(orderId)` — `requireAdmin()`,
      loads the order, guards against re-cancelling an already-`"refunded"`
      order (checked *before* any Stripe call), retrieves the Checkout
      Session (`stripe.checkout.sessions.retrieve`) to read `payment_intent`
      (confirmed via Stripe docs: present on the session by default, no
      `expand` needed), calls `stripe.refunds.create({ payment_intent })`,
      then sets `orders.status = "refunded"` and `revalidatePath("/orders")`.
      `orders.status` is unconstrained `text`, so no schema change is needed
      for the new status value.
      **Tested by:** `__tests__/lib/orders-actions.test.ts` (Stage D) — mocks
      `@/lib/admin`, `@/lib/db`, and `@/lib/stripe`; asserts the
      already-refunded guard short-circuits before any Stripe call, and the
      happy path calls `retrieve` → `refunds.create` with the right
      `payment_intent` → updates status.
- [ ] New `components/cancel-order-button.tsx` — the one deliberate Client
      Component in the app (needed for a `confirm()` gate on a real-money
      action); form `action={cancelOrder.bind(null, orderId)}`, rendered only
      when `order.status !== "refunded"`. No admin-check needed inside it —
      the whole `/orders` page already sits behind Clerk.
      **Tested by:** `__tests__/components/cancel-order-button.test.tsx`
      (Stage D) — RTL render + fires the mocked action on confirm, does not
      fire on cancel.
- [ ] Wire the button into `app/orders/page.tsx`.
      **Tested by:** manual.
- [ ] `README.md` — note refund capability in the Order history section.

**Open trade-off to decide at implementation time:** the `confirm()` dialog is
the one place this app breaks its "zero Client Components" pattern. Dropping
the confirm and shipping a plain server-rendered button is a simpler,
fully-consistent alternative if the extra safety isn't worth the exception —
worth a explicit call before writing the code, not just defaulting silently.

**Commit:** `feat: add admin order cancel/refund action`

**Stage verification:** complete a real Stripe test-card checkout (`4242 4242
4242 4242`), click Cancel & Refund on `/orders`, confirm the Stripe Dashboard
(test mode) shows the PaymentIntent refunded and the order shows
`status: refunded` with the button gone. `npm run test:run`.

---

## Stage D — Test coverage

- [ ] `__tests__/lib/admin.test.ts` — see Stage A.
- [ ] `__tests__/lib/products-actions.test.ts` — see Stage B.
- [ ] `__tests__/lib/orders-actions.test.ts` — see Stage C.
- [ ] `__tests__/lib/db/validation.test.ts` — see Stage B (direct schema
      tests: rejects `priceInCents <= 0`, rejects empty/whitespace `title`,
      rejects non-URL `imageUrl`, rejects malformed `id`, confirms trimming).
- [ ] `__tests__/components/cancel-order-button.test.tsx` — see Stage C.
- [ ] Extend `__tests__/lib/data.test.ts` — see Stage B.

All new tests follow the existing convention exactly: `vi.hoisted()` +
`vi.mock()` before importing the module under test, hand-built chainable
`getDb()` fakes (matching `mockSelectFrom` in the current `data.test.ts`),
`describe`/`it` naming, mocks reset in `beforeEach`.

**Deliberately not tested, and why:**

- `proxy.ts` itself — its logic is now almost entirely Clerk's own
  (`clerkMiddleware`/`createRouteMatcher`); the equivalent value is captured
  by testing `requireAdmin()` and confirming every mutating action calls it.
- Plain fetch-and-render admin/orders pages — this repo has never tested
  pages without branching logic (only `checkout/success/page.tsx` is tested,
  because it has real branches); `app/admin/products/**` follows that precedent.

**Commit:** `test: add coverage for admin auth, product/order actions, and validation`

**Stage verification:** `npm run test:run` (full suite green), `npm run lint`.

---

## Stage E — Close the kickoff doc's TBDs (sketch — write real wording only once A–D are committed)

- [ ] Update `docs/sprint-4-quality/kickoff.md`'s three remaining TBD fields:
      completed capability, most important quality improvement, most valuable
      automated test.
      **Tested by:** N/A (docs only) — but wording must reflect what's
      actually merged, not aspirational scope.

**Commit:** `docs: close sprint-4 kickoff Canvas fields`

---

## Over-engineering guardrails (deliberately avoided)

- No RBAC/roles/`publicMetadata` — any signed-in user is admin.
- No client-side state/caching (SWR, React Query, optimistic UI) — plain
  `<form action={serverAction}>` + `revalidatePath` throughout, matching the
  existing checkout flow.
- No component library — raw HTML + existing Tailwind utilities.
- No Drizzle migration files — `db:push` only, consistent with this
  project's entire history.
- No e2e/browser tests — Vitest + RTL only, matching the existing suite.
- No inline per-field form-error UI — thrown `ZodError` surfaces via Next's
  default error boundary, same as the app's one existing validation case.
- `CancelOrderButton` is the one deliberate Client Component exception —
  flagged above as a trade-off to confirm, not a settled default.
