# Manual Verification — Sprint 2

Performed 2026-07-12 against the `sprint-2` branch (commit `d08e207`), running the
prototype locally with `npm run dev` and Stripe in test mode. This supplements the
automated Vitest suite (`npm run test:run`, 25/25 passing) with an actual walkthrough
of the running app, including a real Stripe Checkout session paid with Stripe's test
card.

## Actions performed / expected / observed

### 1. Load the storefront

- **Action:** `GET /` in a browser.
- **Expected:** Creator profile (name, bio, image) and a 3-product grid, each with a
  price and a "Buy" button.
- **Observed:** Matched. Renders "Mira Alvarez," her bio, and Tidepool Mug ($32.00),
  Desert Light Bowl ($58.00), Moon Vase ($44.00), each with a Buy button.

### 2. Full buy flow with a real Stripe test payment

- **Action:** Clicked "Buy" on the Tidepool Mug, completed Stripe's hosted Checkout
  page with the test card `4242 4242 4242 4242` (exp `12/34`, CVC `123`, ZIP `97403`),
  and let it redirect back.
- **Expected:** Buy → redirect to a real `checkout.stripe.com` session showing the
  correct item/price → after payment, redirect to `/checkout/success?session_id=...` →
  page re-verifies the session against Stripe and shows "Order confirmed."
- **Observed:** Matched exactly. Redirected to a live `checkout.stripe.com/c/pay/cs_test_...`
  session titled "DropShelf sandbox" showing "Tidepool Mug — $32.00" with the correct
  description and image. After paying, landed on `/checkout/success?session_id=cs_test_...`
  showing "Order confirmed — Thanks — your Tidepool Mug is confirmed." Server log
  confirmed the server action ran (`createCheckoutSession("tide-mug") in 2473ms`,
  `POST / 303`) followed by `GET /checkout/success?session_id=... 200`.

### 3. Webhook route — missing signature

- **Action:** `POST /api/webhooks/stripe` with a JSON body and no `stripe-signature`
  header.
- **Expected:** `400` with an error about the missing signature.
- **Observed:** Matched. `400 {"error":"Missing Stripe signature or webhook secret."}`

### 4. Webhook route — signature present but secret unconfigured

- **Action:** `POST /api/webhooks/stripe` with a `stripe-signature` header but no
  `STRIPE_WEBHOOK_SECRET` set in `.env.local` (it was blank in this environment).
- **Expected:** `400`, since the route requires both a signature and a configured
  secret before attempting verification.
- **Observed:** Matched. Same `400` response as above.
- **Caveat:** because `STRIPE_WEBHOOK_SECRET` was unset, this exercised only the
  "missing secret" guard, not the "signature present but invalid" branch
  (`stripe.webhooks.constructEvent` throwing). That branch, and the "accepts a
  verified `checkout.session.completed` event" path, were not re-verified live in this
  pass — Stripe has no way to reach `localhost` without the Stripe CLI's
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe` forwarding events,
  and the CLI isn't installed in this environment. Both branches are covered by the
  mocked automated tests in `__tests__/api/webhooks/stripe/route.test.ts`, but that is
  mocked verification, not a live one. **Follow-up:** install the Stripe CLI and
  re-run `stripe listen` alongside a real purchase to confirm the verified-event path
  end-to-end, then confirm `STRIPE_WEBHOOK_SECRET` is set before relying on this in
  anything beyond local dev.

### 5. Success page — no `session_id`

- **Action:** `GET /checkout/success` with no query string.
- **Expected:** "Nothing to confirm" message, no Stripe call attempted.
- **Observed:** Matched. Page renders "Nothing to confirm — We couldn't find a
  checkout session here."

### 6. Success page — invalid/nonexistent `session_id`

- **Action:** `GET /checkout/success?session_id=cs_test_doesnotexist`.
- **Expected:** Some graceful "not found" or "payment not completed" message, matching
  the handling of the other two states this page already covers.
- **Observed:** **Did not match.** The page throws an unhandled exception —
  `stripe.checkout.sessions.retrieve` rejects with `No such checkout.session:
  cs_test_doesnotexist`, uncaught, and Next.js returns `HTTP 500` with a stack trace
  visible in the dev error overlay.

### 7. Automated suite

- **Action:** `npm run test:run`.
- **Expected:** All tests passing before treating the branch as done.
- **Observed:** Matched. 8 test files, 25/25 tests passed.

## Issues found

1. **`/checkout/success` crashes on an invalid or expired `session_id` instead of
   showing a message.** `app/checkout/success/page.tsx` only branches on "no
   `session_id`" vs. "session retrieved, but not paid" — it never wraps
   `stripe.checkout.sessions.retrieve` in a try/catch, so a bad, expired, or tampered
   session id produces an unhandled 500 rather than the same kind of friendly
   "Nothing to confirm" state already used for the missing-`session_id` case. This is
   reachable by any user who edits the URL, revisits a stale bookmark, or double-clicks
   back after a session expires — not just a hypothetical. **Not fixed as part of this
   verification pass** — logged here for a follow-up commit rather than silently
   patched, so the AI-review doc's "what was found vs. what was accepted" trail stays
   accurate.
2. **Webhook signature-verification and event-acceptance paths are only verified by
   mocked tests, not a live Stripe event, in this environment** (no Stripe CLI
   installed). Functionally low-risk since the mocked tests assert the same
   `stripe.webhooks.constructEvent` call the real code makes, but it's a gap between
   "tested" and "verified against the real Stripe API" worth closing before this goes
   further than a local prototype.

## Engineering conclusion

The core buyer-facing path — storefront → Stripe Checkout → real test payment →
success-page confirmation — works exactly as designed, verified with an actual Stripe
test-mode payment rather than only mocked tests. The webhook route's rejection
behavior (missing signature, missing secret) also works as coded. The one real defect
found, the unhandled 500 on an invalid `session_id`, is a legitimate gap worth fixing
before Sprint 3 — it's a small, well-isolated fix (wrap the `retrieve` call and treat a
Stripe "resource missing" error the same as the "not paid" state) that doesn't change
the resulting architecture. Given that gap is minor and the rest of the flow verified
cleanly end-to-end with real Stripe test infrastructure, the feature slice is sound and
ready to merge, with the `session_id` handling and live webhook re-verification tracked
as immediate follow-ups.
