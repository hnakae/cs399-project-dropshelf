import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/data";

const { create, redirect, getProductById } = vi.hoisted(() => ({
  create: vi.fn(),
  redirect: vi.fn(),
  getProductById: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create } },
  },
}));

vi.mock("next/navigation", () => ({ redirect }));

vi.mock("@/lib/data", () => ({ getProductById }));

import { createCheckoutSession } from "@/lib/actions";

const product: Product = {
  id: "tide-mug",
  title: "Tidepool Mug",
  description:
    "A hand-thrown stoneware mug glazed in layered blues and greens, each one a little different from the last.",
  priceInCents: 3200,
  imageUrl: "https://picsum.photos/seed/dropshelf-product-1/600/600",
};

describe("createCheckoutSession", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    create.mockReset();
    redirect.mockReset();
    getProductById.mockReset();
    getProductById.mockImplementation(async (id: string) =>
      id === product.id ? product : undefined
    );
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it("creates a one-item Stripe Checkout session from the product and redirects to it", async () => {
    create.mockResolvedValue({ url: "https://checkout.stripe.com/session_abc" });

    await createCheckoutSession(product.id);

    expect(create).toHaveBeenCalledWith({
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
      success_url:
        "http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:3000",
      metadata: {
        productId: product.id,
        quantity: "1",
        unitPriceInCents: String(product.priceInCents),
      },
    });
    expect(redirect).toHaveBeenCalledWith(
      "https://checkout.stripe.com/session_abc"
    );
  });

  it("rejects an unknown product id before calling Stripe", async () => {
    await expect(createCheckoutSession("not-a-real-product")).rejects.toThrow(
      "Unknown product: not-a-real-product"
    );

    expect(create).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses to redirect if Stripe doesn't return a Checkout URL", async () => {
    create.mockResolvedValue({ url: null });

    await expect(createCheckoutSession(product.id)).rejects.toThrow(
      "Stripe did not return a Checkout URL."
    );

    expect(redirect).not.toHaveBeenCalled();
  });
});
