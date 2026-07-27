# Manual Verification

This repo organizes documentation per sprint rather than overwriting one file in place
(see `README.md` for the full sprint-by-sprint index). This file exists at this exact
path to match the course's required deliverable location and points to the current,
authoritative document.

**Current (Sprint 3):** [`sprint-3-persistence/manual-verification.md`](sprint-3-persistence/manual-verification.md)
— real Stripe test payments verified end-to-end against a live database, plus a
follow-up verification pass covering the webhook's atomic-write fix, the `/orders` view
(including confirming it's genuinely live-rendered, not cached), and the access-control
gate.

Prior sprints, kept for history per the course's requirement that earlier sprint
documentation remain in the repository:

- [`sprint-2-prototype/manual-verification.md`](sprint-2-prototype/manual-verification.md)
  — the working prototype's buy flow, verified before persistence existed.
