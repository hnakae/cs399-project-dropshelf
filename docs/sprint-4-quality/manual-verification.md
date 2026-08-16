# Manual Verification — Sprint 4

Performed 2026-08-03 on the `sprint-4-quality` branch, running the prototype locally
with `npm run dev`, live Clerk (development instance, resource `clerk-red-garden`,
provisioned via `vercel integration add clerk`), a real Neon Postgres database, and
Stripe in test mode. This supplements the automated Vitest suite (`npm run test:run`,
56/56 passing).

## Actions performed / expected / observed

### 1. Clerk route gating (signed out)

- **Action:** requested `/orders` and `/admin/products` against the running dev server
  while signed out.
- **Expected:** `307` redirect to `/sign-in?redirect_url=...`.
- **Observed:** Matched, for both routes.

### 2. Sign-in page renders cleanly

- **Action:** loaded `/sign-in` directly.
- **Expected:** Clerk's `<SignIn/>` UI renders with no console errors.
- **Observed:** Matched — the only console output was Clerk's expected "development
  keys" warning (a dev-mode notice, not an error).

### 3. Webhook route unaffected by the Clerk gate

- **Action:** confirmed `/api/webhooks/stripe` is still reachable and still enforces its
  own signature check after the `proxy.ts` rewrite.
- **Expected:** unaffected — the webhook route is outside the protected
  `createRouteMatcher(["/orders(.*)", "/admin(.*)"])` matcher.
- **Observed:** Matched.

### 4. `ClerkProvider` / nav (signed-out state)

- **Action:** loaded `/` and `/sign-in`.
- **Expected:** no hydration errors; nav shows a "Sign in" control.
- **Observed:** Matched.

### 5. `requireAdmin()` direct call added to `/orders`

- **Context:** Clerk logged a runtime deprecation warning mid-sprint that
  `createRouteMatcher`-based middleware-only gating is being replaced by resource-level
  checks, since path-matching can diverge from actual Next.js routing.
- **Action:** added a direct `requireAdmin()` call inside `app/orders/page.tsx`,
  matching the pattern `app/admin/layout.tsx` already used.
- **Expected/Observed:** `/orders` is now independently gated at the resource level, not
  only via the route matcher — closes the gap the warning identified.

### 6. `/checkout/success` invalid-session fix

- **Action:** requested `/checkout/success?session_id=<bogus>` against the running dev
  server.
- **Expected:** "Session not found" message, `200` response — not a crash into Next's
  default 500 page.
- **Observed:** Matched — confirmed `200` instead of `500` (`acdc2cd`). Also covered by
  a mocked-rejection case in `__tests__/app/checkout/success/page.test.tsx`.

### 7. Automated suite

- **Action:** `npm run test:run`.
- **Expected:** all tests passing, including the new admin/products-actions/orders-actions/validation
  test files.
- **Observed:** Matched. 56/56 passing.

### 8. Build

- **Action:** `npm run build`.
- **Expected:** succeeds; the new `/sign-in`, `/admin/products`, `/admin/products/new`,
  and `/admin/products/[id]/edit` routes all produced.
- **Observed:** Matched.

## Issues found

1. **Clerk's `createRouteMatcher`-only gating deprecation** — surfaced live via a
   runtime console warning, not from documentation. **Fixed** (see #5 above).
2. **Carried over from Sprint 3, now fixed:** `/checkout/success`'s unhandled 500 on an
   invalid or expired `session_id` (see #6). Not caught by this pass specifically — the
   fix landed as its own commit (`acdc2cd`) and this pass re-confirmed it live.

## Not yet verified — the one open item

The signed-in admin walkthroughs (product create/edit/archive on `/admin/products`, and
order cancel/refund on `/orders`) have **not** been manually exercised in a browser.
Creating the actual admin user in the Clerk Dashboard, and disabling public sign-up in
Clerk's Restrictions settings, is deliberately the student's own manual step, not
automated on their behalf. Until that's done, these flows are verified by automated test
(`__tests__/lib/products-actions.test.ts`, `__tests__/lib/orders-actions.test.ts`) and by
the signed-out gating checks above — not by a live signed-in run. This gap, and what it
implies about the admin model's actual current scope, is tracked in
`architecture.md`'s [Open Questions](architecture.md#open-questions-carried-into-sprint-5).

## Engineering conclusion

The parts of Sprint 4 that don't depend on the admin account existing were verified
against real infrastructure, the same standard Sprint 3's verification pass set: real
route redirects observed via a running server, not just read from the code; a real bug
fix (the invalid-session crash) confirmed to actually return `200` instead of `500`; and
a real, live-surfaced deprecation warning acted on rather than ignored. The remaining
gap — the signed-in admin flows — is deliberately not closed here, since creating the
admin account is explicitly the student's own step, and is carried forward honestly as
open rather than assumed passing.
