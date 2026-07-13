import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { constructEvent } = vi.hoisted(() => ({ constructEvent: vi.fn() }));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent },
  },
}));

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

describe("POST /api/webhooks/stripe", () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    constructEvent.mockReset();
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

  it("logs and accepts a verified checkout.session.completed event", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123" } },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(
      "[stripe] checkout session completed: cs_test_123"
    );
  });

  it("accepts other verified event types without logging a completion", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    constructEvent.mockReturnValue({
      type: "payment_intent.created",
      data: { object: { id: "pi_test_123" } },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
