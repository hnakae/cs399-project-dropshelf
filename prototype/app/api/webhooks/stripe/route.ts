import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { sql } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing Stripe signature or webhook secret." },
      { status: 400 }
    );
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown verification error";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    await recordOrder(event.data.object);
  }

  return NextResponse.json({ received: true });
}

async function recordOrder(session: Stripe.Checkout.Session) {
  const { productId, quantity, unitPriceInCents } = session.metadata ?? {};

  if (!productId || !quantity || !unitPriceInCents) {
    console.error(
      `[stripe] checkout session ${session.id} completed without product metadata`
    );
    return;
  }

  // neon-http has no session/transaction support (drizzle-orm/neon-http throws
  // "No transactions support" on db.transaction()), so the order and its line item
  // are written as one CTE statement instead — atomic by virtue of being a single
  // Postgres statement, with no window for a crash to leave an order with no items.
  // The ON CONFLICT DO NOTHING also makes redelivered webhooks a no-op: if it fires,
  // inserted_order yields zero rows, so the order_items insert selects from nothing.
  await getDb().execute(sql`
    WITH inserted_order AS (
      INSERT INTO orders (stripe_checkout_session_id, status, customer_email, amount_total_in_cents)
      VALUES (${session.id}, ${session.payment_status}, ${session.customer_details?.email ?? null}, ${session.amount_total ?? 0})
      ON CONFLICT (stripe_checkout_session_id) DO NOTHING
      RETURNING id
    )
    INSERT INTO order_items (order_id, product_id, quantity, unit_price_in_cents)
    SELECT id, ${productId}, ${Number(quantity)}, ${Number(unitPriceInCents)}
    FROM inserted_order
  `);
}
