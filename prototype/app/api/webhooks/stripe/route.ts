import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { orderItems, orders } from "@/lib/db/schema";

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

  const db = getDb();

  const [order] = await db
    .insert(orders)
    .values({
      stripeCheckoutSessionId: session.id,
      status: session.payment_status,
      customerEmail: session.customer_details?.email ?? null,
      amountTotalInCents: session.amount_total ?? 0,
    })
    .onConflictDoNothing({ target: orders.stripeCheckoutSessionId })
    .returning();

  if (!order) {
    // Duplicate webhook delivery for a session we've already recorded.
    return;
  }

  await db.insert(orderItems).values({
    orderId: order.id,
    productId,
    quantity: Number(quantity),
    unitPriceInCents: Number(unitPriceInCents),
  });
}
