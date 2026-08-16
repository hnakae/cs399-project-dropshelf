# Architecture

This repo organizes documentation per sprint rather than overwriting one file in place,
so history stays legible (see `README.md` for the full sprint-by-sprint index). This
file exists at this exact path to match the course's required deliverable location and
points to the current, authoritative document.

**Current (Sprint 4):** [`sprint-4-quality/architecture.md`](sprint-4-quality/architecture.md)
— describes Clerk authentication replacing the shared-password gate, full product CRUD,
the order cancel/refund action, and remaining open questions (notably the admin model's
dependence on the Clerk Dashboard's public sign-up setting).

Prior sprints, kept for history per the course's requirement that earlier sprint
documentation remain in the repository:

- [`sprint-1-definition/architecture.md`](sprint-1-definition/architecture.md) — initial
  architecture sketch, no working code yet.
- [`sprint-2-prototype/architecture.md`](sprint-2-prototype/architecture.md) — the
  working prototype (storefront + Stripe checkout), before persistence existed.
- [`sprint-3-persistence/architecture.md`](sprint-3-persistence/architecture.md) — the
  persistence layer (Postgres/Drizzle), the order-history view, and the webhook's atomic
  write.
