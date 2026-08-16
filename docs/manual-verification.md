# Manual Verification

This repo organizes documentation per sprint rather than overwriting one file in place
(see `README.md` for the full sprint-by-sprint index). This file exists at this exact
path to match the course's required deliverable location and points to the current,
authoritative document.

**Current (Sprint 4):** [`sprint-4-quality/manual-verification.md`](sprint-4-quality/manual-verification.md)
— live Clerk route gating, the `/checkout/success` invalid-session fix confirmed against
a running server, and an honest record of the one thing *not* yet manually verified: the
signed-in admin walkthroughs, blocked on creating the admin account by hand.

Prior sprints, kept for history per the course's requirement that earlier sprint
documentation remain in the repository:

- [`sprint-2-prototype/manual-verification.md`](sprint-2-prototype/manual-verification.md)
  — the working prototype's buy flow, verified before persistence existed.
- [`sprint-3-persistence/manual-verification.md`](sprint-3-persistence/manual-verification.md)
  — real Stripe test payments verified end-to-end against a live database, plus the
  webhook atomic-write fix, the `/orders` view, and its access-control gate.
