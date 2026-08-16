# Manual Verification — Sprint 5

Performed 2026-08-15 on the `sprint-5-completion` branch, against the real Clerk
development instance (resource `clerk-red-garden`) and the same real Neon Postgres
database prior sprints used, and Stripe in test mode. This document is standalone —
Sprint 1–4's verification records live on their own branches, not here.

## Actions performed / expected / observed

### 1. `ADMIN_USER_ID` matches the real, single admin account

- **Action:** queried the Clerk Backend API directly (`GET /v1/users`, read-only) rather
  than assuming the account this app was configured against.
- **Expected:** exactly one user, matching the single-shop-owner assumption
  `requireAdmin()`'s identity check depends on.
- **Observed:** matched — exactly one account (`nakae27@gmail.com`,
  `user_3HOBRomYUoy7IlaYcSsEhfWMJGS`), which is the id written into
  `ADMIN_USER_ID` in `.env.local`.

### 2. Automated suite

- **Action:** `npm run test:run`.
- **Expected:** all tests passing, including new coverage for the identity check
  (`__tests__/lib/admin.test.ts`) and the refund status-write ordering
  (`__tests__/lib/orders-actions.test.ts`).
- **Observed:** matched. 58/58 passing (13 test files) — up from 56 at the end of
  Sprint 4.

### 3. Build and typecheck

- **Action:** `npm run build`, `tsc --noEmit`, `eslint` on the changed files.
- **Expected:** clean build, no type errors, no lint errors; all admin/sign-in routes
  still produced.
- **Observed:** matched. Build succeeded (`/`, `/admin/products`,
  `/admin/products/[id]/edit`, `/admin/products/new`, `/api/webhooks/stripe`,
  `/checkout/success`, `/orders`, `/sign-in/[[...sign-in]]` all present); `tsc` and
  `eslint` both clean.

### 4. README environment-variable checklist matches reality

- **Action:** grepped the repo for the retired `ORDERS_VIEW_PASSWORD` variable after
  rewriting the root README's Prerequisites section.
- **Expected:** no remaining references anywhere in `.md`/`.ts`/`.tsx` files.
- **Observed:** matched — none found.

## Not yet verified — two open items

Both were open at the end of Sprint 4 and remain open now; neither is new to this
sprint, but neither has been closed either:

1. **No live signed-in browser walkthrough of `requireAdmin()`'s identity check.**
   There is exactly one Clerk account (confirmed in #1 above), so there's no second,
   non-admin account available in this environment to actually attempt a sign-in and
   watch the rejection happen live. The identity check is verified by automated test
   (mocked `auth()`) and by the fact that the one real account's id matches
   `ADMIN_USER_ID` exactly, but not by watching a *different* signed-in user actually
   get turned away.
2. **Disabling public sign-up in the Clerk Dashboard couldn't be confirmed from this
   environment.** `GET /v1/instance/restrictions` — the read path for that setting —
   returns `405 Method Not Allowed` (it's write-only via the Backend API), so there's no
   way to check its current state without opening the Dashboard directly. This remains
   the user's own step to confirm, as it was at the end of Sprint 4.
3. **The refund status-write fix has not been exercised against a real Stripe test
   refund.** `cancelOrder`'s `"refunding"` → `"refunded"` transition is covered by unit
   tests with a mocked Stripe client (including a test that simulates the Stripe call
   failing), but not by an actual test-mode checkout followed by a real Cancel & Refund
   click and a database read confirming the two writes landed in order.

## Engineering conclusion

What could be verified without a second Clerk account or a live checkout was verified
against real infrastructure, not just re-read from the code: the actual Clerk user list
(not an assumption), a full clean build and test run, and a direct grep confirming no
stale env var references survived the README rewrite. What's still open is open for a
concrete, stated reason in each case (no second test account, a write-only settings
endpoint, no live checkout run this pass) rather than silently assumed passing.
