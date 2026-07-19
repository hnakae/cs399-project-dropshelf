1. Why Applications Need Persistence
Why it matters: Most useful software needs information that survives after the program closes. Understanding why persistence exists is more important than memorizing a particular database.

Suggested AI prompt:
Explain persistence to me as a beginning software engineering student. Compare temporary program memory with persistent storage, and then relate the explanation to my own project.

    Temporary memory vs. persistent storage

    Temporary (volatile) memory is where a running program keeps its data while it executes — variables, objects, arrays, all living in RAM. It's fast, but it only exists as long as the process is alive. The moment the program stops — crash, restart, redeploy — everything in it is gone, because nothing wrote it down anywhere else.

    Persistent storage means the data is written to something that survives the process ending: a file on disk, a row in a database. Slower to read/write than RAM, but it's still there tomorrow, after a restart, or from a completely different machine.

    The mental model: RAM is a whiteboard, persistent storage is a notebook. Erase the whiteboard (process exits) and the notes are gone. The notebook is still there when you open it again.

    Where this shows up in your project now

    This is the same question you asked me back at the start of this session — the difference is your project has since moved from the "whiteboard" side of that line to the "notebook" side. Concretely:

    - Before: lib/data.ts held products as a hardcoded JavaScript array — literally baked into your source code, recreated fresh every time the server started. Not really "data" in the persistence sense at all; more like a constant.
    - Now: lib/data.ts's getProducts() and getProductById() query a real products table in Postgres (lib/db/schema.ts). The catalog is genuinely stored data — you could edit a row directly in the database (npm run db:studio) without touching or redeploying any code, and it would show up on the site immediately.
    - Before: app/api/webhooks/stripe/route.ts did console.log(...) when a purchase completed. A log line isn't persistence — it's transient output that scrolls away, and even if captured, it's not structured, queryable data. There was no way to ever ask "what did this customer buy?" after the fact.
    - Now: that same webhook handler writes an orders row and an order_items row to Postgres. A completed Stripe purchase leaves a permanent, queryable record — you verified this yourself, running a real test payment and then querying the database directly to see the exact row land with the right session ID, amount, and product.

    One nuance worth knowing for your demo: not everything in your app needs to be persistent, and that's a deliberate choice, not an oversight. The getDb() client in lib/db/index.ts itself — the open connection object — lives in memory and gets rebuilt every time the server process restarts. That's fine, because the connection is disposable; what matters is that the rows it reads and writes live in Postgres, not the connection object itself. Persistence is about which specific data needs to outlive the process — here, that's the product catalog and order history, not the plumbing that talks to the database.


2. Choosing What Data Should Be Stored
Why it matters: Good software engineering starts by deciding what information should survive between program executions and what information only exists temporarily.

Suggested AI prompt:
Help me identify the information in my project that should be stored permanently. Explain why each item should or should not be persistent.

    Sorting your project's data: persistent vs. not

    The useful way to do this isn't a single yes/no per item — it's three buckets: data you own and must persist yourself, data that must persist but belongs to someone else's system, and data that should stay in memory on purpose. Your project already has real examples of all three.

    Persistent — in your own database (already implemented)

    Products (products table — id, title, description, price_in_cents, image_url)
    Must survive restarts because it's the thing your storefront exists to show. If it lived only in memory, every deploy would reset your catalog to whatever's hardcoded in source — which is literally what Sprint 2 did, and why it had to change. It also needs to be editable independent of a code deploy (npm run db:studio and the row updates live).

    Orders (orders table — session id, status, customer email, amount, created_at)
    This is the actual business record of a sale. Without it, there's no way to answer "did this person pay," "how much," or "when" after the fact — no dispute handling, no support, no revenue reporting. This is the item that made "persistence" a real requirement rather than an academic exercise: a console.log line disappears the moment your terminal scrolls past it or the process restarts; a database row doesn't.

    Order items (order_items table — order_id, product_id, quantity, unit_price_in_cents)
    Notice this table stores its own copy of unit_price_in_cents rather than looking the price up from products every time. That's deliberate: if you change a product's price next week, last month's orders should still show what the customer actually paid, not today's price. This is a small but real persistence design decision — some data needs to be a permanent snapshot, not a live reference.

    Persistent — but not your responsibility to store

    Payment/card details and charge status
    These live in Stripe's systems, not yours. Your /checkout/success page re-fetches the session straight from Stripe (stripe.checkout.sessions.retrieve) instead of trusting a locally cached copy. This is intentional, not a gap: storing raw card data yourself would pull you into PCI compliance scope for no benefit, and Stripe is already the authoritative, durable source for "was this actually paid." Owning less persistence is sometimes the better engineering call.

    Secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, DATABASE_URL)
    These absolutely need to survive restarts — but they belong in .env.local / Vercel's environment variable store, not a database table. This is a different kind of persistence: configuration, not business data, and it needs different protections (never logged, never in git, encrypted at rest by the platform) than a products row does.

    Arguably persistent, deliberately deferred

    Creator profile (creator object in lib/data.ts — still hardcoded)
    In principle this belongs in a database the same way products do. In practice: there's exactly one creator, nothing in the app ever writes to it, and a single-row table wouldn't demonstrate any relational value. The honest reasoning here isn't "this data doesn't need to persist" — it's "the cost of persisting it doesn't pay for itself yet, given the current one-creator scope." That's a legitimate scope call, but it's the first thing that would need to change if multi-creator support ever got built.

    Correctly not persistent

    The database connection itself (getDb() in lib/db/index.ts)
    The Drizzle client object is a runtime resource — like an open socket — rebuilt fresh every cold start. Persisting it would make no sense; only the rows it reads and writes need to survive.

    In-flight UI state (e.g., what's typed in a form before you hit submit)
    Lives in React state in the browser's memory. If the tab closes before submitting, losing it is correct behavior, not a bug — nothing was ever supposed to be recorded yet.

    Debug/log output (console.error in the webhook when metadata is missing, stripe listen's terminal log)
    Useful while you're watching it happen, gone once the terminal scrolls or the process exits. This is exactly the category the old webhook code mistakenly used as if it were persistence — a log line that looks like a record but isn't one.

    The general pattern worth taking away: ask "does anything outside this running process need to know this happened, later, reliably?" If yes, it needs real persistence, and then a second question — whose database should own it? — decides where.


3. Thinking in Tables and Relationships
Why it matters: Relational databases organize information into related tables. Even if your project eventually uses another technology, relational thinking helps you organize data more clearly.

Suggested AI prompt:
Based on my project description, help me identify possible tables, primary keys, and relationships. Explain why each table exists before suggesting SQL.

    From project description to schema

    Your project description says: creators set up a profile, list products, and buyers pay via Stripe. That sentence already implies four "things" worth asking about — each becomes a candidate table only if it has its own identity, its own attributes, and needs to be referenced from more than one place. If something is just a fact about another thing, it's a column, not a table.

    Why each table exists

    creators — implied by the description, not currently built. A creator has attributes independent of any product (name, bio, image) and, in the full vision, one creator would have many products. That "one-to-many" relationship is exactly the signal that creator deserves its own table rather than being duplicated onto every product row. Your actual build skips this table — there's exactly one creator, hardcoded in lib/data.ts — because with only one row, a table adds a foreign key everywhere for zero relational benefit. It's the first table that would need to exist if the project ever supported more than one creator.

    products — implemented. A product has its own attributes (title, description, price, image) that don't belong to any single order — the same product gets referenced by many different orders over time. If you instead stored product details directly inside every order record, you'd duplicate that text/price on every purchase and have no single place to update a product's description.

    orders — implemented. An order is the record of one checkout event: who paid, how much, when, and Stripe's reference to it. It needs its own identity because a single order can contain multiple line items (not in your current one-item-per-purchase scope, but the shape supports it), and because "this purchase happened" is a fact worth keeping independent of which specific products were in it.

    order_items — implemented. This is the table that actually connects orders to products. It exists because the relationship between an order and a product isn't one-to-one — one order can have many items, and one product appears in many orders — which is a many-to-many relationship in general. The standard way to model many-to-many is a linking table in the middle, with its own attributes (quantity, the price at the time of purchase) that don't belong to either the order or the product alone.

    Primary keys

    ┌──────────────────┬─────────────────────┬─────────────────────────────────────────────┐
    │      Table       │     Primary key     │                     Why                     │
    ├──────────────────┼─────────────────────┼─────────────────────────────────────────────┤
    │ creators         │ id (surrogate,      │ No natural attribute is guaranteed          │
    │ (hypothetical)   │ serial)             │ unique/stable; auto-increment is simplest.  │
    ├──────────────────┼─────────────────────┼─────────────────────────────────────────────┤
    │                  │ id (natural key,    │ A human-readable slug that's already unique │
    │ products         │ text — e.g.         │  and meaningful in URLs/checkout — no need  │
    │                  │ "tide-mug")         │ for a separate surrogate key.               │
    ├──────────────────┼─────────────────────┼─────────────────────────────────────────────┤
    │ orders           │ id (surrogate,      │ Orders don't have a natural unique          │
    │                  │ serial)             │ attribute of their own to key on.           │
    ├──────────────────┼─────────────────────┼─────────────────────────────────────────────┤
    │ order_items      │ id (surrogate,      │ Same reasoning — it's a row identity, not a │
    │                  │ serial)             │  business identifier.                       │
    └──────────────────┴─────────────────────┴─────────────────────────────────────────────┘

    One more key worth naming: orders.stripe_checkout_session_id isn't the primary key, but it's a unique column — it's how you correlate a webhook event back to a specific order, and the uniqueness constraint is what makes the "don't insert a duplicate order on a redelivered webhook" logic possible.

    Relationships

    - creators 1 → * products (hypothetical — not built): one creator has many products.
    - orders 1 → * order_items: one order has many line items.
    - products 1 → * order_items: one product appears in many order items across different orders.

    order_items is the many-to-many bridge between orders and products — every order-item row means "this order included this product, at this quantity, at this price."

    SQL

    This matches what's actually running in lib/db/schema.ts (Drizzle generates equivalent DDL to this):

    -- Not in the current build — shown for the fuller multi-creator design
    CREATE TABLE creators (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    bio TEXT NOT NULL,
    image_url TEXT NOT NULL
    );

    CREATE TABLE products (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price_in_cents INTEGER NOT NULL,
    image_url TEXT NOT NULL
    -- creator_id TEXT REFERENCES creators(id)  -- would be added if creators existed
    );

    CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    stripe_checkout_session_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    customer_email TEXT,
    amount_total_in_cents INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price_in_cents INTEGER NOT NULL
    );

    Note order_items.unit_price_in_cents duplicates data that also lives in products.price_in_cents — that's not an oversight, it's the earlier point about snapshotting: an order should freeze the price at time of purchase, independent of later price changes.


4. SQL Fundamentals
Why it matters: You should understand what SQL does, even if AI helps write the statements. Focus on understanding rather than memorizing syntax.

Suggested AI prompt:
Teach me the purpose of SELECT, INSERT, UPDATE, DELETE, and CREATE TABLE using simple examples. After each example, ask me to explain what the statement does in my own words.

    SELECT — reading data without changing it

    SELECT retrieves rows from a table. It doesn't modify anything — it's a read-only look at what's already there. You use it to answer questions like "what products do I have?" or "show me one specific thing."

    Example, against your real products table:

    SELECT title, price_in_cents
    FROM products
    WHERE id = 'tide-mug';

5. JSON Compared with Relational Databases
Why it matters: JSON and relational databases solve different problems. Software engineers should understand when each approach is appropriate.

Suggested AI prompt:
Compare storing my project data in JSON with storing it in a relational database. Explain the advantages, disadvantages, and when each approach is appropriate for my project.

    JSON vs. relational database — for DropShelf specifically

    This isn't hypothetical for you — you already lived this migration. Sprint 2's lib/data.ts (a hardcoded array of product objects) was structurally identical to a JSON file. Sprint 3 replaced it with Postgres. So the comparison below is "what you had" vs. "what you have now," not two abstract options.

    JSON / flat file

    Advantages
    - Dead simple — no server, no connection string, no migrations, no ORM. Read it, it's just an object.
    - Fast for small data, since there's no network round trip — it's already in memory.
    - Human-readable and easy to git diff.
    - Zero setup cost — great for genuinely static, read-only content.

    Disadvantages
    - Nothing enforces relationships. A JSON order-item could reference a product id that doesn't exist, and nothing would stop you — no foreign key to catch the mistake.
    - No safe concurrent writes. If two requests tried to write to the same JSON file at once, you could get corrupted or lost data. A database handles simultaneous writes correctly; a flat file doesn't.
    - No query language. "All orders over $50" means loading the whole file into your app and filtering in JavaScript, instead of letting the database do it efficiently.
    - This is the one that actually broke your project's requirements: Vercel runs your app as separate, ephemeral serverless function instances. There's no shared filesystem between them. Even if you'd tried to have the webhook append to a JSON file, that write might land in a container that disappears the moment the request finishes — the next request could hit a completely different instance that never saw it. JSON-on-disk fundamentally cannot be your source of truth once your app has multiple, disposable server instances, which is exactly how Vercel deploys Next.js.

    Relational database (Postgres, your current setup)

    Advantages
    - Foreign keys enforce relationships — order_items.product_id genuinely cannot reference a nonexistent product; the database rejects the write.
    - A real query language — filtering, aggregating, joining is the database's job, not your application code's.
    - Safe concurrent writes — many simultaneous checkouts don't corrupt each other.
    - One shared database, not per-instance files — every serverless function instance talks to the same Postgres database, so state is actually consistent across your whole deployed app. This is the property JSON couldn't give you.
    - Schema constraints (NOT NULL, UNIQUE) catch bad data at write time instead of silently accepting it.

    Disadvantages
    - More moving parts — a provisioned database, a connection, migrations (drizzle-kit push), a driver/ORM.
    - Slower per-read than an in-memory array (network round trip to Neon), though this is negligible next to everything else a web request already does.
    - Requires thinking about schema shape up front, though Drizzle makes that iterative rather than a one-time commitment.
    - One honest gap worth naming in your own code: your webhook does two separate inserts (orders then order_items) without wrapping them in an explicit database transaction. If the process crashed between them, you could end up with an order that has no items. JSON wouldn't have caught this either, but it's the kind of thing a relational database is built to guarantee — you're just not using that guarantee yet. Worth a Sprint 4 note.

    When each is appropriate here

    - JSON/hardcoded is still the right choice for creator in your app today — it's read-only, there's exactly one of it, nothing ever writes to it, so none of JSON's disadvantages actually apply. The lesson isn't "always use a database," it's "use one when data needs to be written at runtime and survive across requests/instances."
    - A relational database became necessary the moment two things became true for products/orders/order_items: the data needed to be written at runtime (a purchase happening), and that write needed to be durable and shared across every serverless instance of your app — not just held in whichever container happened to handle that one request.

6. Evaluating AI-Generated Database Designs
Why it matters: AI can generate database schemas quickly, but software engineers must evaluate whether those schemas are understandable, appropriately sized, and aligned with project requirements.

Suggested AI prompt:
Review this proposed database schema. Explain why each table exists, identify unnecessary complexity, suggest simplifications, and tell me what questions I should ask before accepting the design.

    Why each table exists

    - products — catalog data (title, description, price, image) referenced by many purchases over time. Needs its own identity so it isn't duplicated into every order.
    - orders — one row per completed Stripe Checkout session: who paid, how much, when, Stripe's reference. The top-level "a purchase happened" record.
    - order_items — the bridge between an order and the product(s) in it, carrying quantity and the price at the time of purchase (deliberately separate from products.price_in_cents, which can change later).

    Unnecessary complexity

    order_items as a separate table, for an app that only ever creates one item per order. createCheckoutSession currently only builds a single-line-item Stripe session — there is no code path today that produces more than one order_items row per order. Given that, you could argue the whole table is complexity that isn't earning its keep yet: product_id, quantity, and unit_price_in_cents could just be columns on orders directly, with no join required to read an order. The counter-argument (why I'd probably still keep it) is that it's future-proofing for a multi-item cart at low cost — one extra table, one extra join — rather than a redesign later. But that's a bet on future scope, not a free decision, and it's fair to name it as complexity rather than pretend it's obviously justified.

    status is unconstrained free text. Nothing in the schema restricts it to Stripe's actual possible values ("paid", "unpaid", "no_payment_required"). A typo or an unexpected new Stripe value would be stored silently, with no error, no matter what it is.

    Simplifications

    - Constrain status with a Postgres CHECK constraint or enum type instead of bare text — cheap to add, catches bad data at write time instead of trusting every future code path to only ever pass valid values.
    - Pick and enforce a convention for repeated products in one order. Right now nothing stops (or defines) whether buying two of the same product becomes one order_items row with quantity = 2 or two separate rows with quantity = 1. That ambiguity should be resolved explicitly (e.g., a unique constraint on (order_id, product_id) if you want the "one row, quantity field" convention), not left to whatever the code happens to do.
    - Make the foreign-key delete behavior explicit. order_items.product_id → products.id currently has no stated onDelete behavior, which means Postgres defaults to blocking the delete (NO ACTION) if any order still references that product. That's probably the right default — you don't want deleting a product to silently erase order history — but right now it's accidental rather than a decision anyone actually made and wrote down.

    Questions to ask before accepting this design

    1. Will an order ever legitimately contain more than one distinct product? If the honest answer is "not for the foreseeable future," order_items is complexity paid for a feature that doesn't exist yet — worth deciding on purpose, not by default.
    2. What happens when a product referenced by past orders gets discontinued? Soft-delete (is_active flag) so history stays intact, or is deletion just never expected to happen?
    3. Should orders.status ever change after the row is created (refund, cancellation), or is "written once at checkout.session.completed, never touched again" a safe permanent assumption? If it can change, you're missing an updated_at column and a way to know when a status changed.
    4. Is amount_total_in_cents on orders meant to always equal the sum of its order_items, or is it intentionally a separate snapshot of what Stripe itself reported? (I'd argue the latter is actually correct — it's Stripe's number, not a derived total — but that's worth stating explicitly rather than leaving as an assumption someone could "simplify away" later by mistake.)
    5. Are products.id slugs ever expected to change once created? Every other table references them by foreign key, so renaming a slug later is a much bigger operation than renaming a display field would be with a surrogate integer key instead.

7. Engineering Thinking
Why it matters: Software engineers choose technologies because they solve problems, not because they are popular. Throughout Sprint 3, focus on understanding the engineering tradeoffs behind your persistence decisions.

Suggested AI prompt:
Based on my current project, ask me engineering questions that help me justify my persistence choices. Challenge my decisions and suggest alternatives, but do not simply tell me the answer.

Remember: This week is about understanding persistence and data modeling, not becoming a database expert. If you understand why data is organized the way it is, AI can help you with much of the implementation detail.

    1. Why a relational database at all, given the current scale? You have 3 products and effectively one creator. What would have to be true about your project for Postgres to actually be the wrong call — and are any of those conditions close to being true for you?
    2. Your webhook does two separate inserts — orders, then order_items — with no database transaction wrapping them. What's the actual failure mode if the process crashes or the connection drops between those two statements? Walk through what state the database would be in, and whether anything downstream would notice.
    3. You store unit_price_in_cents on order_items as a snapshot, separate from products.price_in_cents. Give me a concrete scenario — real numbers, real timeline — where skipping that snapshot and just joining to the live product price would produce a wrong answer to a real business question.
    4. /checkout/success still re-verifies the payment by calling Stripe directly, even though the order is now persisted in your own database. Now that you have your own copy of the data, what's the actual argument for still trusting Stripe over your own database here? Is there a version of this where trusting your own DB would be a mistake?
    5. You protected against duplicate webhook deliveries with onConflictDoNothing on stripe_checkout_session_id. Is that sufficient on its own, or is there a timing scenario — two requests hitting your server for the same event at nearly the same instant — that this doesn't actually cover? What would you need to check to find out?
    6. creator is still a hardcoded object, not a database row. You've defended that as "not worth it at one creator." What's the specific trigger — the exact thing that would have to change about the product — that would flip that decision?
    7. You're on Neon Postgres via the Vercel Marketplace integration. If you had to move this project off Vercel next month, what happens to your order history? Is your data actually portable, or did the provisioning path couple you to something harder to leave than plain Postgres would be?