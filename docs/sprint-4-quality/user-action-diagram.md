# DropShelf — UML Diagrams

For the Sprint 4 Engineering Demonstration: two UML sequence diagrams
covering the buyer and admin user actions, and a UML class diagram for the
underlying data model. GitHub and most Markdown viewers render Mermaid
blocks directly.

## Buyer flow (public, no sign-in)

Covers browsing, checkout, and the two independent paths that follow a
Stripe payment: the async webhook that persists the order, and the buyer's
own redirect back to a confirmation page that re-verifies against Stripe
rather than trusting the redirect.

```mermaid
sequenceDiagram
    actor Buyer
    participant App as DropShelf (Next.js)
    participant Stripe
    participant DB as Postgres

    Buyer->>App: Browse catalog (GET /)
    App->>DB: getProducts()
    DB-->>App: non-archived products
    App-->>Buyer: render catalog

    Buyer->>App: Click Buy
    App->>Stripe: checkout.sessions.create()
    Stripe-->>App: session.url
    App-->>Buyer: redirect to Stripe Checkout

    Buyer->>Stripe: Complete payment
    Stripe-->>Buyer: redirect to /checkout/success?session_id=...

    par Async webhook
        Stripe->>App: POST /api/webhooks/stripe (checkout.session.completed)
        App->>App: verify signature
        App->>DB: atomic insert orders + order_items (ON CONFLICT DO NOTHING)
    and Buyer-facing confirmation
        Buyer->>App: GET /checkout/success?session_id=...
        App->>Stripe: checkout.sessions.retrieve(session_id)
        alt session not found or invalid
            Stripe-->>App: error
            App-->>Buyer: Session not found
        else unpaid
            Stripe-->>App: payment_status != paid
            App-->>Buyer: Payment not completed
        else paid
            Stripe-->>App: payment_status == paid
            App-->>Buyer: Order confirmed
        end
    end
```

## Admin flow (Clerk-gated: `/orders`, `/admin/*`)

Covers the Sprint 4 additions: signing in, cancelling an order for a Stripe
refund, and managing the product catalog. Every branch that mutates data
calls `requireAdmin()` itself, independent of the proxy-level redirect.

```mermaid
sequenceDiagram
    actor Admin
    participant Proxy as proxy.ts (Clerk middleware)
    participant App as DropShelf (Next.js)
    participant Clerk
    participant Stripe
    participant DB as Postgres

    Admin->>Proxy: GET /orders or /admin/products
    Proxy->>Clerk: check session
    alt not signed in
        Clerk-->>Proxy: no session
        Proxy-->>Admin: redirect to /sign-in
        Admin->>Clerk: sign in
        Clerk-->>Admin: session cookie
        Admin->>Proxy: retry original request
    end
    Proxy-->>App: forward request
    App->>App: requireAdmin() resource-level check

    alt Cancel and Refund
        Admin->>App: click Cancel and Refund
        App->>App: requireAdmin()
        App->>DB: select order
        alt already refunded
            App-->>Admin: throw already refunded
        else not yet refunded
            App->>Stripe: checkout.sessions.retrieve(session_id)
            App->>Stripe: refunds.create(payment_intent)
            App->>DB: update orders.status = refunded
            App-->>Admin: revalidate /orders
        end
    else Manage products
        Admin->>App: create, edit, or archive product
        App->>App: requireAdmin() and Zod validate
        App->>DB: insert or update products
        App-->>Admin: revalidate /admin/products and /
    end
```

## Data model

`Order` has many `OrderItem`s; each `OrderItem` references exactly one
`Product`. Archiving a product only sets `isArchived` — the row is never
deleted, so `OrderItem.productId` always resolves and past orders keep
showing the correct product title.

```mermaid
classDiagram
    class Product {
        +string id
        +string title
        +string description
        +int priceInCents
        +string imageUrl
        +boolean isArchived
    }
    class Order {
        +int id
        +string stripeCheckoutSessionId
        +string status
        +string customerEmail
        +int amountTotalInCents
        +Date createdAt
    }
    class OrderItem {
        +int id
        +int orderId
        +string productId
        +int quantity
        +int unitPriceInCents
    }
    Order "1" --> "many" OrderItem : has
    OrderItem "many" --> "1" Product : references
```

## Notes for the demo

- **Two independent auth layers, on purpose.** `proxy.ts` (Clerk middleware)
  is the first, "optimistic" gate — it redirects a signed-out visitor before
  the page even renders. Every Server Action (`createProduct`,
  `updateProduct`, `archiveProduct`, `cancelOrder`) *also* calls
  `requireAdmin()` itself, because Server Actions are reachable independently
  of whether their page rendered. If asked "why check twice," this is the
  answer.
- **The webhook path is deliberately decoupled from the buyer's browser.**
  `/checkout/success` re-verifies directly against Stripe rather than reading
  the database, because the webhook write is async and might not have landed
  yet when the buyer's browser redirects back.
- **Archiving is soft delete, not row deletion** — see the data model above:
  the foreign key from `OrderItem` to `Product` is why a hard delete would
  either fail or corrupt historical order display.
- **Refunding is a status transition, not a general edit.** `cancelOrder`
  guards against double-refunding (checked before any Stripe call), so
  clicking Cancel & Refund twice on the same order can't charge Stripe twice.
