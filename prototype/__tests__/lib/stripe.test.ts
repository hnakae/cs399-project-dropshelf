// Tests for the lib/stripe client construction: throws a clear error when
// STRIPE_SECRET_KEY is missing, builds a real Stripe client when it's set.
import { afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

describe("lib/stripe", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    vi.resetModules();
  });

  it("throws a clear error when STRIPE_SECRET_KEY is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    vi.resetModules();

    await expect(import("@/lib/stripe")).rejects.toThrow(
      "Missing STRIPE_SECRET_KEY environment variable. Add it to .env.local."
    );
  });

  it("builds a Stripe client from STRIPE_SECRET_KEY when it's set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    vi.resetModules();

    const { stripe } = await import("@/lib/stripe");

    expect(stripe).toBeInstanceOf(Stripe);
  });
});
