import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { constructEvent, getDb } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent },
  },
}));

vi.mock("@/lib/db", () => ({ getDb }));

import { POST } from "@/app/api/webhooks/stripe/route";
import { orderItems, orders } from "@/lib/db/schema";

function makeRequest({
  body = "{}",
  signature = "t=1,v1=fake",
}: { body?: string; signature?: string | null } = {}) {
  const headers = new Headers();
  if (signature !== null) headers.set("stripe-signature", signature);
  return new Request("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers,
    body,
  });
}

function mockDb({ orderReturning = [{ id: 1 }] as { id: number }[] } = {}) {
  const orderItemsValues = vi.fn().mockResolvedValue(undefined);
  const returning = vi.fn().mockResolvedValue(orderReturning);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const ordersValues = vi.fn().mockReturnValue({ onConflictDoNothing });

  const insert = vi.fn((table: unknown) => {
    if (table === orders) return { values: ordersValues };
    if (table === orderItems) return { values: orderItemsValues };
    throw new Error("Unexpected table passed to db.insert");
  });

  getDb.mockReturnValue({ insert });

  return { insert, ordersValues, onConflictDoNothing, orderItemsValues };
}

describe("POST /api/webhooks/stripe", () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    constructEvent.mockReset();
    getDb.mockReset();
  });

  afterEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it("rejects requests with no stripe-signature header", async () => {
    const res = await POST(makeRequest({ signature: null }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Missing Stripe signature or webhook secret.",
    });
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("rejects requests when the webhook secret is not configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("rejects requests with a signature Stripe can't verify", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });

    const res = await POST(makeRequest({ signature: "t=1,v1=bad" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        "Webhook signature verification failed: No signatures found matching the expected signature",
    });
  });

  it("persists an order and order item for a verified checkout.session.completed event", async () => {
    const { ordersValues, orderItemsValues } = mockDb();
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          payment_status: "paid",
          customer_details: { email: "buyer@example.com" },
          amount_total: 3200,
          metadata: {
            productId: "tide-mug",
            quantity: "1",
            unitPriceInCents: "3200",
          },
        },
      },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(ordersValues).toHaveBeenCalledWith({
      stripeCheckoutSessionId: "cs_test_123",
      status: "paid",
      customerEmail: "buyer@example.com",
      amountTotalInCents: 3200,
    });
    expect(orderItemsValues).toHaveBeenCalledWith({
      orderId: 1,
      productId: "tide-mug",
      quantity: 1,
      unitPriceInCents: 3200,
    });
  });

  it("skips persistence and logs an error when checkout metadata is missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { insert } = mockDb();
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_456", metadata: {} } },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(insert).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "[stripe] checkout session cs_test_456 completed without product metadata"
    );
  });

  it("does not insert a duplicate order item when the same session is delivered twice", async () => {
    const { orderItemsValues } = mockDb({ orderReturning: [] });
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_789",
          payment_status: "paid",
          amount_total: 3200,
          metadata: {
            productId: "tide-mug",
            quantity: "1",
            unitPriceInCents: "3200",
          },
        },
      },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(orderItemsValues).not.toHaveBeenCalled();
  });

  it("accepts other verified event types without touching the database", async () => {
    constructEvent.mockReturnValue({
      type: "payment_intent.created",
      data: { object: { id: "pi_test_123" } },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(getDb).not.toHaveBeenCalled();
  });
});
