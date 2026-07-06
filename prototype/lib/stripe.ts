import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY environment variable. Add it to .env.local."
  );
}

export const stripe = new Stripe(secretKey);
