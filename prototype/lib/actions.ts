"use server";

import { redirect } from "next/navigation";
import { getProductById } from "./data";
import { stripe } from "./stripe";
import { getBaseUrl } from "./utils";

export async function createCheckoutSession(productId: string) {
  const product = await getProductById(productId);

  if (!product) {
    throw new Error(`Unknown product: ${productId}`);
  }

  const baseUrl = getBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: product.priceInCents,
          product_data: {
            name: product.title,
            description: product.description,
            images: [product.imageUrl],
          },
        },
      },
    ],
    success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: baseUrl,
    metadata: {
      productId: product.id,
      quantity: "1",
      unitPriceInCents: String(product.priceInCents),
    },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  redirect(session.url);
}
