"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./admin";
import { getDb } from "./db";
import { orders } from "./db/schema";
import { stripe } from "./stripe";

export async function cancelOrder(orderId: number) {
  await requireAdmin();

  const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId));
  if (!order) {
    throw new Error(`Unknown order: ${orderId}`);
  }
  if (order.status === "refunded") {
    throw new Error(`Order ${orderId} has already been refunded.`);
  }

  const session = await stripe.checkout.sessions.retrieve(
    order.stripeCheckoutSessionId
  );
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) {
    throw new Error(
      `Checkout session ${order.stripeCheckoutSessionId} has no payment to refund.`
    );
  }

  await stripe.refunds.create({ payment_intent: paymentIntentId });

  await getDb()
    .update(orders)
    .set({ status: "refunded" })
    .where(eq(orders.id, orderId));

  revalidatePath("/orders");
}
