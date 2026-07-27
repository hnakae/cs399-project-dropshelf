# Update — Orders view access control

## The problem

`/orders` (see `updates/orders-view.md`) renders customer email addresses and purchase
history. This app has no user-account or auth system anywhere — no login, no sessions,
nothing. Left open, `/orders` would be a public URL leaking real customer data to
anyone who found it.

## Options considered

1. **No gate.** Simplest, matches the app's current no-auth state everywhere else. Only
   acceptable if this stays a local/demo-only deployment.
2. **Clerk.** A real third-party auth provider — native Vercel Marketplace integration,
   auto-provisioned env vars, prebuilt `<SignIn/>` components, `clerkMiddleware()`
   route protection.
3. **A lightweight shared-secret gate.** HTTP Basic Auth checked against one env var,
   no new dependency, no user accounts.

## Decision

Went with **(3)**, after seriously considering **(2)**.

Clerk is the objectively better long-term answer if this app ever needs real user
accounts, and it's the right pick among third-party auth providers on Vercel (native
Marketplace integration vs. Descope/Auth0). But adopting it here — for gating a single
internal, read-only page, with zero other auth surface in the app — is disproportionate
to the actual need: a new external service dependency, `clerkMiddleware()`, sign-in/
sign-up routes, and session handling, to protect one page. This course's own Sprint 3
framing is explicit that this week is "stabilization, not new features" — standing up a
full auth vendor is new-feature-shaped work, not the persistence-and-documentation
stabilization this sprint is scoped to. That tradeoff was surfaced directly and the
lighter option was chosen deliberately, not by default.

## What was built

`proxy.ts` (project root):

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const password = process.env.ORDERS_VIEW_PASSWORD;
  if (!password) {
    return new NextResponse("ORDERS_VIEW_PASSWORD is not configured", {
      status: 500,
    });
  }

  const expected = `Basic ${Buffer.from(`orders:${password}`).toString("base64")}`;
  if (request.headers.get("authorization") === expected) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Orders"' },
  });
}

export const config = {
  matcher: "/orders",
};
```

- Standard HTTP Basic Auth — the browser's native username/password prompt, no custom
  sign-in UI needed.
- Username is hardcoded as `"orders"` and must be typed exactly; it is compared as part
  of the full encoded credential string, not ignored. (An earlier comment in
  `.env.local` incorrectly said the username was ignored — corrected after review.)
- Password comes from `ORDERS_VIEW_PASSWORD`, added to `.env.local` (already gitignored
  via `.env*`; never committed).
- **Fails closed:** if `ORDERS_VIEW_PASSWORD` isn't set at all, the route returns `500`
  rather than falling through to an open page. A missing env var can't accidentally
  turn the gate off.

## Why `proxy.ts`, not `middleware.ts`

This project runs Next.js 16.2.9, which renamed the `middleware.ts` file convention to
`proxy.ts` (the exported function is now `proxy`, not `middleware`) as of v16.0.0 — the
project's own `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
proxy.md` documents this and provides a codemod (`npx @next/codemod@canary
middleware-to-proxy .`) for projects migrating from the old name. This was verified
against the local docs and the actual build output (`npm run build` reports it as
`ƒ Proxy (Middleware)`) before writing the file — not assumed from prior Next.js
knowledge, per this repo's `AGENTS.md` instruction to check for breaking changes before
writing code against this Next.js version.

## Verification

- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/orders` → `401` (no
  credentials).
- Same with `-u orders:wrongpassword` → `401`.
- Same with `-u orders:<real password>` → `200`, and the response body matched the
  actual database contents (see `updates/orders-view.md`).

## Engineering judgment

**Rejected:** Clerk, for this specific use case, despite it being the stronger general
tool — the scope mismatch (one internal page vs. a full auth subsystem) and this
sprint's explicit "no new features" framing were the deciding factors, not a judgment
that Clerk itself is a bad choice.

**Accepted:** failing closed (500 when unconfigured) over failing open, and hardcoding
the username rather than making it configurable — there's exactly one thing this gate
protects and one person expected to use it; a configurable username would be complexity
with no current purpose.

## Open question for Sprint 4

If real user accounts or multi-admin access ever become an actual requirement, this
gate should be replaced by real auth (Clerk being the leading candidate, per the above)
rather than layered underneath one — a shared password checked in `proxy.ts` should be
treated as a stabilization-sprint stopgap, not a permanent access-control design.
