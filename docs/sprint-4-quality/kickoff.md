# Sprint 4 Kickoff — DropShelf

**Implemented so far:** DropShelf is a working storefront where a buyer can browse a database-backed product catalog, pay through a real Stripe Checkout session, and have the completed order persisted atomically to Postgres (`orders` + `order_items`), visible on an auth-gated `/orders` view — covering the persistence workflow's Create and Read paths.

**Sprint 4 needs:** complete the persistence workflow with a narrowly scoped Update (or Delete) capability, close the known `/checkout/success` 500-on-invalid-session bug, add the automated test coverage `/orders` currently lacks, and record a maintainability improvement — all documented per the course's Sprint 4 deliverable requirements.

**Status (2026-08-02):** scope grew beyond the original "narrowly scoped Update or Delete" ask, by explicit request — see `docs/sprint-4-quality/plan.md` for the full staged plan and rationale. Shipped: Clerk authentication (replacing the shared-password Basic Auth gate), full product CRUD (create/edit/archive), an order cancel-and-refund action, and test coverage for all of it (55 tests passing). **Not done:** the `/checkout/success` 500-on-invalid-session bug from the original scope is still open — it was superseded by this larger body of work rather than addressed. Also still open: live browser verification of the Clerk sign-in and refund flows, blocked on accepting the Clerk marketplace terms in the browser (`vercel integration add clerk` needs a one-time manual step) — everything is verified by automated tests and a clean build/lint/typecheck in the meantime.

## Canvas submission

- **GitHub repository URL:** <https://github.com/hnakae/cs399-project-dropshelf>
- **Sprint 4 branch name:** `sprint-4-quality` (pushed to origin)
- **Completed capability (one sentence):** Signed-in admins can create, edit, and archive products, and cancel an order with an automatic Stripe refund — extending the persistence workflow from Create/Read to full CRUD plus a compensating (refund) transaction, all gated by real Clerk authentication instead of a shared password.
- **Most important quality improvement (one sentence):** Replacing the single shared-password HTTP Basic Auth gate on `/orders` with per-user Clerk authentication, removing a single leaked env var as a total compromise vector for the admin surface now that it can mutate data, not just display it.
- **Most valuable automated test (one sentence):** The `cancelOrder` test asserting Stripe's refund API is never called once an order is already `"refunded"`, since a double-refund attempt is the one bug class in this feature set with actual financial consequences.
