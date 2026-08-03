// Tests for POST /api/webhooks/stripe, covering signature verification and
// order persistence on checkout.session.completed:
//   - missing signature/webhook secret, or a signature Stripe rejects -> 400
//   - a verified event persists orders + order_items as one atomic SQL
//     statement, idempotent on redelivery (ON CONFLICT DO NOTHING)
//   - a verified event missing product metadata is logged and skipped,
//     not persisted
//   - other verified event types are accepted without touching the database
import { StringChunk, type SQL } from "drizzle-orm";
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

function mockDb() {
  const execute = vi.fn().mockResolvedValue(undefined);
  getDb.mockReturnValue({ execute });
  return { execute };
}

/** Pulls the literal SQL text and the interpolated values out of a `sql` template query,
 * so tests can assert on them without a real database. */
function describeQuery(query: SQL) {
  const text = query.queryChunks
    .filter((chunk): chunk is StringChunk => chunk instanceof StringChunk)
    .map((chunk) => chunk.value.join(""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const params = query.queryChunks.filter(
    (chunk) => !(chunk instanceof StringChunk)
  );
  return { text, params };
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
    const { execute } = mockDb();
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
    expect(execute).toHaveBeenCalledTimes(1);
    const { params } = describeQuery(execute.mock.calls[0][0] as SQL);
    expect(params).toEqual([
      "cs_test_123",
      "paid",
      "buyer@example.com",
      3200,
      "tide-mug",
      1,
      3200,
    ]);
  });

  it("writes the order and order item as a single atomic statement, idempotent on redelivery", async () => {
    const { execute } = mockDb();
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
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

    await POST(makeRequest());

    // There is no separate "check if it already exists" round-trip: the ON CONFLICT
    // DO NOTHING lives inside the same statement that inserts the order item, so a
    // redelivered webhook can't land a half-written order between two calls.
    expect(execute).toHaveBeenCalledTimes(1);
    const { text } = describeQuery(execute.mock.calls[0][0] as SQL);
    expect(text).toContain("ON CONFLICT (stripe_checkout_session_id) DO NOTHING");
    expect(text).toContain("INSERT INTO order_items");
    expect(text).toContain("FROM inserted_order");
  });

  it("skips persistence and logs an error when checkout metadata is missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { execute } = mockDb();
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_456", metadata: {} } },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(execute).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "[stripe] checkout session cs_test_456 completed without product metadata"
    );
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
