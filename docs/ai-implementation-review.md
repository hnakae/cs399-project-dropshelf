# AI Implementation Review — Sprint 5

## AI implementation assistance

AI (Claude) implemented the Sprint 5 work: the `ADMIN_USER_ID` identity check
(`lib/admin.ts`), the refund status-write reordering (`lib/orders-actions.ts`), the
accompanying test updates, the Sprint 4 documentation (written this sprint, then the
prior-sprint `docs/` folders were removed per a later restructuring decision), the root
`README.md`'s Prerequisites section and environment-variable fixes, and this
documentation set.

This sprint's work was driven by two independent student peer reviews of the Sprint 4
branch (recorded in `docs/plan.md`), not by AI's own initiative — I
read both reviews, wrote the prioritized plan myself, and directed AI through it item by
item.

Where I directed the implementation, rather than leaving it to AI's default:

- **`ADMIN_USER_ID` over a Clerk `publicMetadata.role` claim.** Both reviews offered
  this as one of two options. I went with the environment-variable comparison because it
  doesn't depend on any Clerk Dashboard configuration staying correct — it's a pure code
  and env var invariant, which fits a defense-in-depth check better than a check that
  itself depends on the same dashboard being configured correctly.
- **Populating `ADMIN_USER_ID` by querying the live Clerk user list**, not by guessing
  or leaving it blank. I had AI use the Clerk Backend API's read-only `GET /v1/users` to
  confirm there really is exactly one account before writing its id into `.env.local` —
  a read-only lookup, not a configuration change, so it didn't need the same
  confirmation a write would have.
- **Reversing the refund's write order rather than only documenting the risk.** The
  review offered a documentation-only fallback ("write it down as an accepted risk") if
  time was short. I had AI do the actual code fix instead — mark `"refunding"` before
  the Stripe call, `"refunded"` after — since the fix itself was small and the
  alternative would have left a real, known double-refund risk in place.
- **Deleting Sprint 1–4's `docs/` folders from this branch, keeping the branches
  themselves.** This wasn't in the original plan; I asked for it mid-sprint once I
  decided I only wanted this sprint's own trio of docs in `docs/`. I confirmed I meant
  archive-in-branches, not delete-from-the-repo-entirely, since a stated course
  requirement (visible in the stub files themselves) was that earlier sprint
  documentation stay in the repository — keeping the branches satisfies that without
  duplicating every prior sprint's docs onto this one.

## AI engineering review

AI flagged a real, direct conflict before acting on the docs-removal request: every
root stub file (`docs/architecture.md`, etc.) explicitly stated "kept for history per
the course's requirement that earlier sprint documentation remain in the repository."
Rather than deleting the folders on my first request, it surfaced that line and asked
how I wanted to reconcile it — archive, delete anyway, or reconsider — before touching
anything. I chose to keep the branches and delete the folders, which is documented above
as my call, not AI's default.

Separately, AI caught its own git-history mistake during this sprint: an early batch of
commits for the `ADMIN_USER_ID` work had already been made (apparently outside the
visible conversation) with malformed messages — full run-on sentences instead of a
proper subject line, one with a stray leading space — and had already been pushed to
`origin`. When I asked to redo them, AI didn't just add new commits on top; it reset the
branch back to before all of them, re-committed cleanly, and used
`--force-with-lease` (not a bare `--force`) to push the correction, which fails safely
if the remote had moved in the meantime instead of silently overwriting new work.

## Accepted suggestion

I accepted AI's proposal that a retry from the `"refunding"` state should stay allowed,
rather than being blocked the same way `"refunded"` is. The reasoning held up: if the
Stripe call never actually ran, a retry correctly initiates it; if it already succeeded,
Stripe itself rejects re-refunding an already-refunded charge, so the failure surfaces
as a clear error instead of a silent double refund either way.

## Rejected / postponed suggestion

I did not have AI attempt to programmatically disable public sign-up in the Clerk
Dashboard via the Backend API, even though AI offered to (after checking API scopes and
showing the exact request first). I chose to do that one myself in the Dashboard
instead — it's a live instance-wide security setting, and I wanted to make that specific
change directly rather than through an agent, even a cautious one. It's logged as still
open in `manual-verification.md` rather than assumed done.

I also did not have AI verify the refund fix or the identity check against a live
Stripe test refund or a second real Clerk sign-in this sprint — both are logged as open
in `manual-verification.md` for concrete, stated reasons (no second test account
available, no live checkout run this pass), not silently skipped.

## Manual verification after AI review

- Confirmed the real Clerk user list directly via the Backend API before trusting
  `ADMIN_USER_ID`'s value, rather than assuming the configured id was correct.
- Ran the full automated suite (58/58), a full production build, `tsc --noEmit`, and
  `eslint` on every changed file after this sprint's code changes.
- Grepped the repository for the retired `ORDERS_VIEW_PASSWORD` variable after rewriting
  the README, rather than assuming the rewrite was complete.
- Did **not** claim the two items in `manual-verification.md`'s "Not yet verified"
  section were checked, because they weren't.

## Engineering responsibility statement

All final decisions this sprint — the `ADMIN_USER_ID` approach over Clerk metadata, the
code fix over the documentation-only fallback for the refund ordering, doing the Clerk
Dashboard sign-up change myself rather than through AI, and archiving rather than
deleting prior sprint history — were mine, made after AI presented the tradeoffs and, in
the docs-removal case, actively surfaced a conflict with a stated course requirement
before proceeding rather than after. AI implemented the fixes, wrote the tests, and
caught its own commit-history mistake mid-sprint rather than leaving it for me to find.
I'm the one accepting this branch as ready for the Sprint 5 review, with the Clerk
Dashboard sign-up setting and the live refund/sign-in walkthroughs tracked openly as
unverified rather than assumed done.
