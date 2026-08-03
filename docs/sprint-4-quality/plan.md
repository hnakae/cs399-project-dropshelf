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

> **Status (2026-08-03): provisioned and live-verified.** Terms accepted,
> `vercel integration add clerk` succeeded (resource `clerk-red-garden`),
> `vercel env pull` wrote `CLERK_SECRET_KEY` +
> `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` into `.env.local`. Verified live
> against a running `npm run dev`: `/orders` and `/admin/products` both
> `307` redirect to `/sign-in?redirect_url=...` when signed out, `/sign-in`
> renders Clerk's `<SignIn/>` UI with no console errors (only the expected
> "development keys" warning), and `/api/webhooks/stripe` is unaffected
> (still reachable, still enforces its own signature check). One follow-up
> fix landed from this: Clerk logs a runtime deprecation warning that
> `createRouteMatcher`-based middleware gating is being replaced by
> resource-level checks, since path-matching can diverge from actual Next.js
> routing — `/orders/page.tsx` was relying solely on the proxy gate, so it
> now also calls `requireAdmin()` directly, matching the pattern `/admin/*`
> already had via its layout (`d35d11b`). Still open: creating the actual
> admin user in the Clerk Dashboard is the user's step, not something done
> here — so a full signed-in walkthrough (Stage B/C's manual checks) is
> still pending that.

- [x] Provision Clerk: `vercel integration add clerk` (auto-provisions
      `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`), then
      `vercel env pull .env.local --yes`.
      **Tested by:** confirmed both keys present in `.env.local` after pull. **Done.**
- [ ] Create the one admin user directly in the Clerk Dashboard; disable
      public sign-up in Clerk's Restrictions settings (no `/sign-up` route is
      shipped — deliberate, see plan rationale below). **This is the user's
      step** — not something to do on their behalf in their auth system.
      **Tested by:** manual — confirm dashboard restriction is set.
- [x] `npm install @clerk/nextjs` (`@clerk/nextjs@^7.6.4`).
      **Tested by:** `npm run build` succeeds with the import resolvable. **Passing.**
- [x] Rewrite `proxy.ts`: `clerkMiddleware` + `createRouteMatcher(["/orders(.*)", "/admin(.*)"])`,
      broad `matcher` config (per Clerk convention — do NOT narrow the
      top-level matcher to just those paths, or the session handshake breaks
      on other routes). Removes the old Basic Auth / `ORDERS_VIEW_PASSWORD`
      block entirely. Also see the `d35d11b` follow-up above re: the
      `createRouteMatcher` deprecation warning.
      **Tested by:** manual — signed out, visiting `/orders` and any
      `/admin/*` path redirects to `/sign-in`; webhook route unaffected.
      **Verified live** against `npm run dev` + `curl`.
- [x] Add `lib/admin.ts` exporting `requireAdmin()` (`await auth()`, throws if
      no `userId`) — used for defense-in-depth inside Server Actions, since
      proxy-level gating alone is only an "optimistic check" per the Next.js
      auth guide.
      **Tested by:** `__tests__/lib/admin.test.ts` (Stage D) — mocks
      `@clerk/nextjs/server`'s `auth`, asserts throw when signed out /
      resolve when signed in. **Passing.**
- [x] Wrap `app/layout.tsx` body in `<ClerkProvider>`.
      **Tested by:** manual — no hydration errors in dev console; `<UserButton />` renders.
      **Verified live** — no console errors on `/` or `/sign-in`.
- [x] Add `app/sign-in/[[...sign-in]]/page.tsx` using Clerk's `<SignIn />`.
      **Tested by:** manual — sign-in flow completes and redirects back.
      **Partially verified:** the `<SignIn/>` UI itself renders correctly
      live; completing an actual sign-in needs the admin account, which is
      the user's step above.
- [x] Update `components/nav.tsx` with a sign-in/out control + `<UserButton />`.
      **Deviation from the original plan:** `@clerk/nextjs@7` (Core 3) has
      actually dropped the `<SignedIn>`/`<SignedOut>` components this plan
      assumed — confirmed by inspecting `node_modules/@clerk/nextjs`'s actual
      exports, not just the (stale) cached skill docs. Used the current
      replacement instead: `<Show when="signed-in">` / `<Show when="signed-out">`.
      **Tested by:** manual visual check, both signed-in and signed-out states.
      **Verified signed-out state live** (nav shows a "SIGN IN" link); the
      signed-in state needs the admin account (user's step above).
- [x] Update `README.md` — replace `ORDERS_VIEW_PASSWORD` env docs with Clerk env vars.
      **Tested by:** N/A (docs only).

**Commit:** `feat: replace Basic Auth with Clerk authentication` (`1599ae7`),
follow-up fix `d35d11b`

**Stage verification:** `npm run build` ✅, `npm run lint` ✅, `npm run test:run` ✅
(55/55 passing). Live-verified: route gating, sign-in page rendering, webhook
still public. Still open (user's step): create the admin account in the
Clerk Dashboard, then walk through Stage B/C's signed-in flows.

---

## Stage B — Products CRUD

> **Status (2026-08-02): complete and committed** (`9c68f60`, `7842718`).
> `db:push` was run against the live dev database. The one item still
> genuinely open is the manual browser walkthrough (needs Clerk sign-in
> from Stage A first).

- [x] Add `isArchived: boolean("is_archived").notNull().default(false)` to
      `products` in `lib/db/schema.ts`; applied with `npm run db:push`
      (confirmed against the live Neon database).
      **Tested by:** `__tests__/lib/data.test.ts` extension asserting
      `getProducts()` filters `isArchived = false` (mocked `getDb`, no real
      DB hit). **Passing.**
- [x] Extend `lib/db/validation.ts`: refine `insertProductSchema` with real
      business rules (non-empty trimmed `title`/`description`, positive
      integer `priceInCents`, valid-URL `imageUrl`, slug-shaped `id`); add
      `updateProductSchema` via `createUpdateSchema`, omitting `id` and `isArchived`.
      **Tested by:** `__tests__/lib/db/validation.test.ts` (Stage D) — direct
      schema unit tests, no mocking needed. **Passing (8 tests).**
- [x] `lib/data.ts`: filter `getProducts()` to non-archived; add
      `getAllProductsIncludingArchived()` for the admin list. No change needed
      to `getProductById` or `getOrders()` — soft delete never removes the
      row, so historical order joins keep resolving titles.
      **Tested by:** `__tests__/lib/data.test.ts`. **Passing.**
- [x] New `lib/products-actions.ts` (kept separate from buyer-facing
      `lib/actions.ts` so the trust boundary is visible by filename):
      `createProduct`, `updateProduct`, `archiveProduct` — each calls
      `requireAdmin()` first, validates via the schemas above, calls
      `revalidatePath("/admin/products")` + `revalidatePath("/")`.
      **Tested by:** `__tests__/lib/products-actions.test.ts` (Stage D) —
      mocks `@/lib/admin` and `@/lib/db`; asserts admin-check runs before any
      DB call, and bad input is rejected before any DB call. **Passing (8 tests).**
- [x] New `app/admin/layout.tsx` — single shared `requireAdmin()` call for all
      admin pages (does not replace the per-action checks — Server Actions
      are independently reachable).
      **Tested by:** manual — visiting any `/admin/*` page while signed out
      redirects. **Not yet run** (needs live Clerk keys).
- [x] New `app/admin/products/page.tsx` (list via
      `getAllProductsIncludingArchived()`, Edit link + inline Archive form per row),
      `app/admin/products/new/page.tsx` (create form),
      `app/admin/products/[id]/edit/page.tsx` (edit + archive forms,
      `notFound()` if missing) — plain Server Components + native
      `<form action={serverAction}>`, matching the existing checkout-button idiom.
      **Tested by:** manual only (matches this repo's existing precedent of
      not unit-testing plain fetch-and-render pages — see Stage D notes).
      **Not yet run** (needs live Clerk keys).
- [x] `components/nav.tsx` — add `/admin/products` link inside the signed-in state.
      **Tested by:** manual visual check. **Not yet run** (needs live Clerk keys).
- [x] `README.md` — note archiving behavior in the Database section.

**Commits (split for reviewability):**

1. `feat: add product archiving and refined create/update validation schemas`
   (schema.ts, validation.ts, data.ts) — `9c68f60`
2. `feat: add admin product management UI and actions`
   (products-actions.ts, app/admin/**, nav.tsx, README.md) — `7842718`

**Stage verification:** `npm run db:push` ✅; `npm run test:run` ✅; `npm run lint` ✅.
Manual browser walkthrough (create → appears on `/` and admin list; edit →
catalog reflects it; archive → disappears from `/` but stays visible in
`/admin/products`; archived product still shows correctly on a past order)
is the one item still pending, blocked on Stage A's Clerk provisioning.

---

## Stage C — Order cancel/refund

> **Status (2026-08-02): complete and committed** (`3d04b39`). The
> real-money end-to-end check (Stripe test-card checkout → click Cancel &
> Refund → confirm refunded in the Stripe Dashboard) is the one item left,
> blocked on Stage A's Clerk provisioning (the button lives behind the
> Clerk-gated `/orders` page).

- [x] New `lib/orders-actions.ts`: `cancelOrder(orderId)` — `requireAdmin()`,
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
      `payment_intent` → updates status. Also covers an expanded (object,
      not string) `payment_intent` and a session with no payment to refund.
      **Passing (6 tests).**
- [x] New `components/cancel-order-button.tsx` — the one deliberate Client
      Component in the app (needed for a `confirm()` gate on a real-money
      action); form `action={cancelOrder.bind(null, orderId)}`, rendered only
      when `order.status !== "refunded"`. No admin-check needed inside it —
      the whole `/orders` page already sits behind Clerk.
      **Tested by:** `__tests__/components/cancel-order-button.test.tsx`
      (Stage D) — RTL render + fires the mocked action on confirm, does not
      fire on cancel. **Passing (3 tests, including the positive-confirm case.)**
- [x] Wire the button into `app/orders/page.tsx`.
      **Tested by:** manual. **Not yet run** (needs live Clerk keys).
- [x] `README.md` — note refund capability in the Order history section.

**Trade-off decided:** kept the `confirm()` dialog — a real-money-moving
action gets a confirmation gate even though it's the one Client Component
exception in the app.

**Commit:** `feat: add admin order cancel/refund action` (`3d04b39`)

**Stage verification:** `npm run test:run` ✅. The real Stripe test-card
checkout → Cancel & Refund → Stripe Dashboard confirmation is still pending,
blocked on Stage A.

---

## Stage D — Test coverage

> **Status (2026-08-02): complete and committed** (`8a40c4b`). Full suite:
> 55/55 passing (`npm run test:run`), plus `tsc --noEmit` and `npm run lint`
> both clean, and `npm run build` produces all expected routes.

- [x] `__tests__/lib/admin.test.ts` — see Stage A. **2 tests.**
- [x] `__tests__/lib/products-actions.test.ts` — see Stage B. **8 tests.**
- [x] `__tests__/lib/orders-actions.test.ts` — see Stage C. **6 tests.**
- [x] `__tests__/lib/db/validation.test.ts` — see Stage B (direct schema
      tests: rejects `priceInCents <= 0`, rejects empty/whitespace `title`,
      rejects non-URL `imageUrl`, rejects malformed `id`, confirms trimming).
      **8 tests.**
- [x] `__tests__/components/cancel-order-button.test.tsx` — see Stage C. **3 tests.**
- [x] Extend `__tests__/lib/data.test.ts` — see Stage B.

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

**Commit:** `test: add coverage for admin auth, product/order actions, and validation` (`8a40c4b`)

**Stage verification:** `npm run test:run` ✅ (full suite green, 55/55), `npm run lint` ✅.

---

## Stage E — Close the kickoff doc's TBDs

> **Status (2026-08-02): complete.** Also noted, honestly, that the
> original kickoff scope's `/checkout/success` bug fix was superseded by
> this larger body of work and is still open — not silently dropped.

- [x] Update `docs/sprint-4-quality/kickoff.md`'s three remaining TBD fields:
      completed capability, most important quality improvement, most valuable
      automated test.
      **Tested by:** N/A (docs only) — wording reflects what's actually
      merged (verified against `git log` and the passing test suite), not
      aspirational scope.

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

---

## Deferred — multi-item cart (research done, not built)

Not part of Stages A–E above. Raised separately: today every order has
exactly one `order_item`, since `createCheckoutSession` only ever takes one
`productId` with quantity hardcoded to `1` — the `Order` -> many `OrderItem`
relationship in the data model (see `docs/sprint-4-quality/user-action-diagram.md`'s
class diagram) has never actually been exercised. A real shopping cart
(multiple products + quantities before one checkout) would fix that. This
is a genuinely separate feature — new client-side cart state, new UI,
reworked checkout + webhook — not a small tweak, so it's parked here rather
than folded into Stage B/C.

**API research already done and verified (not assumed from memory):**

- `line_items[].price_data.product_data.metadata` is a real, documented
  Stripe field (confirmed via `stripe docs api POST /v1/checkout/sessions`)
  — each line item can carry its own `{ productId: product.id }` by
  creating an inline Product per line. Replaces today's flat top-level
  `session.metadata`, which only works because there's currently exactly
  one item.
- Webhook side: `checkout.session.completed` does NOT include line items.
  Stripe's documented fulfillment pattern is
  `stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] })`.
  To read back the per-item `productId` metadata, expand deeper:
  `stripe.checkout.sessions.listLineItems(sessionId, { expand:
  ['data.price.product'] })` — confirmed `expand?: Array<string>` on
  `SessionListLineItemsParams` in the installed `stripe` SDK
  (`node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts`). Without the
  expand, `line_item.price.product` is just a string id.
- `drizzle-orm`'s `sql.join(chunks, separator?)` is real (confirmed in
  `node_modules/drizzle-orm/sql/sql.d.ts`) — needed to generalize the
  webhook's current single-CTE atomic insert (`recordOrder` in
  `app/api/webhooks/stripe/route.ts`) from exactly one `order_items` row to
  N rows in one statement: a dynamic `VALUES (...), (...), ...` list built
  with `sql.join(...)`, still one atomic, idempotent statement (`ON
  CONFLICT DO NOTHING` on the order makes a redelivered webhook a no-op for
  all N rows at once).
- Confirmed via the Next.js fork's `mutating-data.md`: Server Actions can
  be invoked directly from a Client Component `onClick`, not just
  `<form action>` — needed since a cart with a dynamic item count can't be
  expressed as today's single `.bind(null, productId)` form action. **Not
  yet verified:** whether `redirect()` inside a Server Action called this
  way (imperative, not a form submission) behaves the same as the
  documented form-action case — check this live before relying on it.

**Design direction sketched (not finalized — needs its own plan-mode pass):**

- Cart state client-side only (React Context + `localStorage`) — no buyer
  accounts exist, so there's nowhere server-side to put it. Store a
  denormalized snapshot per line (`productId`, `title`, `priceInCents`,
  `imageUrl`, `quantity`) so the cart page renders without an extra fetch,
  but `createCheckoutSession` must re-look-up the *current* price
  server-side per `productId` and ignore whatever the client cart claims —
  a tampered cart can't buy at a fake price.
- New Client Component leaves, following the `CancelOrderButton` precedent
  of isolating interactivity into small leaves rather than converting
  whole pages: `AddToCartButton` (replaces `ProductCard`'s direct-buy
  form), a cart-count indicator in `Nav`, and a `/cart` page (list, adjust
  quantity, remove, checkout).
- `lib/data.ts`: add `getProductsByIds(ids: string[])` (Drizzle `inArray`)
  to re-validate every cart line against real, current, non-archived
  product rows before creating the Stripe session.
- `lib/actions.ts`: `createCheckoutSession(productId: string)` becomes
  something like `createCheckoutSession(items: CartItem[])`, building N
  `line_items` instead of one.
- Webhook `recordOrder` reworked to call `listLineItems` (above) instead of
  reading flat `session.metadata`, then bulk-insert via the `sql.join`
  pattern above.
- A `CartItem` Zod schema (`productId: string`, `quantity: positive int`),
  probably in a new small `lib/cart.ts` shared by the client cart context
  and the server action.

**Open questions for when this is picked back up:** exact `/cart` page UX;
whether `createCheckoutSession` stays in `lib/actions.ts` or moves to its
own file (not a trust-boundary split like the admin actions — this is still
fully public/buyer-facing — so likely just file-size hygiene either way);
test plan for the cart context and multi-item webhook path (same
`vi.hoisted`/`vi.mock` conventions as the rest of `__tests__/`).

**Next step:** re-enter plan mode, verify the `redirect()`-from-`onClick`
question above, then produce a proper staged plan (file list per stage,
test annotations, commit messages, matching Stages A–E's format) and get it
approved via `ExitPlanMode` before writing any code.
