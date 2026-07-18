Persistence evaluation for your app

Your data has a genuinely relational shape: an order has many line items, each line item points at a product. That's the textbook case for foreign keys and joins — not really what document databases are built for (you'd end up either embedding a product snapshot in every order document, duplicating catalog data, or reaching for manual joins anyway). So my recommendation is a SQL database, not NoSQL, and I'd frame it that way for your demo: the tradeoff isn't close for this schema.

Concretely, three tables:
- products — id, title, description, price_in_cents, image_url (replaces the hardcoded array in lib/data.ts)
- orders — id, stripe_checkout_session_id, status, customer_email, amount_total, created_at
- order_items — id, order_id (FK), product_id (FK), quantity, unit_price_in_cents

That's also a clean, explainable example of "relational thinking" for the demo: one-to-many (order → items) plus a reference (item → product).

For where/how: since Vercel discontinued its own Postgres in favor of Marketplace-provisioned databases, the standard path now is Neon Postgres via the Vercel Marketplace — free tier, integrates with env vars automatically once linked.

For the ORM layer, the real tradeoff for a course project:
- Drizzle — TypeScript-native, schema reads like SQL, lightweight, minimal magic (easy to explain line-by-line in a demo).
- Prisma — separate schema DSL + codegen step, more "batteries included," probably what most SQL/ORM tutorials you've seen use, slightly more moving parts to explain.
- No ORM (raw parameterized SQL via the Neon client) — most transparent for demonstrating you understand SQL itself, but you write joins by hand.

⏺ User answered Claude's questions:
· Which persistence stack should we implement? → why drizzle over prisma?

Fair question — here's the concrete difference, not just marketing:

Schema definition. Prisma uses its own DSL in a separate schema.prisma file — not TypeScript, its own syntax that Prisma's compiler reads:
prisma
model Order {
  id        String      @id @default(cuid())
  status    String
  items     OrderItem[]
}
model OrderItem {
  id        String  @id @default(cuid())
  orderId   String
  order     Order   @relation(fields: [orderId], references: [id])
  productId String
  quantity  Int
}
Drizzle defines the schema in a plain .ts file, using regular TypeScript functions:
export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
});
export const orderItems = pgTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").references(() => orders.id),
  productId: text("product_id").references(() => products.id),
  quantity: integer("quantity").notNull(),
});

Codegen. Prisma requires a prisma generate build step that writes a client into node_modules/@prisma/client from the DSL file — one more moving part, and historically Prisma also shipped a Rust query-engine binary that needed extra config to run well in serverless functions (Vercel). Drizzle has no separate language and no generated client — your TypeScript schema is the source of truth, types are inferred directly, and it runs as plain JS over Neon's HTTP driver with nothing extra to configure for serverless.

Where Prisma actually wins: its @relation syntax is arguably more explicit about relationships than Drizzle's .references() — if the main teaching goal is "clearly show a reviewer you understand one-to-many/foreign keys," Prisma's schema reads a bit more like a diagram. Drizzle is closer to literal SQL, which is better if you want to say "I understand what SQL this generates" rather than "I understand this abstraction."

So: Prisma = more common in tutorials, extra codegen/runtime layer, very explicit relation syntax. Drizzle = no separate DSL or build step, thinner and closer to SQL, marginally less standard to look up help for.

--

Task 1 needs an interactive browser login, so you'll need to run this part yourself — paste each line with a ! prefix so the output lands here and I can pick up from there:

! npm i -g vercel
! vercel login
! vercel link
! vercel integration add neon
! vercel env pull .env.local --yes

A few notes on what happens at each step:
- vercel login opens a browser to authenticate your account.
- vercel link will ask which scope/team and whether to create a new project or link to an existing one — for a course prototype, creating a new project tied to this repo is the right call.
- vercel integration add neon opens the Marketplace flow to provision a free-tier Neon Postgres database and attach it to the project.
- vercel env pull writes DATABASE_URL (and anything else) into .env.local.

Go ahead and run those, and let me know once vercel env pull finishes — I'll verify DATABASE_URL landed in .env.local (name only, I won't touch the value) and then move on to the Drizzle schema and code changes.

--

