// Tests for cancelOrder(): requires admin before touching the database or
// Stripe; rejects an unknown order id; refuses to refund an order that's
// already "refunded" without calling Stripe (the guard against a double
// refund); on the happy path retrieves the Checkout Session, refunds the
// right PaymentIntent (handling both a string id and an expanded object),
// marks the order "refunding" before calling Stripe and "refunded" after;
// leaves the order stuck at "refunding" rather than "paid" if the Stripe
// call itself fails, so a retry can't reach the guard above and re-refund;
// refuses to refund a session with no payment intent to refund.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, getDb, retrieve, refundsCreate } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getDb: vi.fn(),
  retrieve: vi.fn(),
  refundsCreate: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin }));
vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { retrieve } },
    refunds: { create: refundsCreate },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { cancelOrder } from "@/lib/orders-actions";

const order = {
  id: 1,
  stripeCheckoutSessionId: "cs_test_123",
  status: "paid",
  customerEmail: "buyer@example.com",
  amountTotalInCents: 3200,
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

function mockDb(orderRow: typeof order | undefined) {
  const selectWhere = vi.fn().mockResolvedValue(orderRow ? [orderRow] : []);
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({ where: selectWhere }),
  });

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set });

  getDb.mockReturnValue({ select, update });
  return { select, update, set, updateWhere };
}

beforeEach(() => {
  requireAdmin.mockReset();
  getDb.mockReset();
  retrieve.mockReset();
  refundsCreate.mockReset();
  requireAdmin.mockResolvedValue("user_123");
});

describe("cancelOrder", () => {
  it("requires admin before touching the database or Stripe", async () => {
    requireAdmin.mockRejectedValue(new Error("Admin authentication required."));
    mockDb(order);

    await expect(cancelOrder(order.id)).rejects.toThrow(
      "Admin authentication required."
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("rejects an unknown order id", async () => {
    mockDb(undefined);

    await expect(cancelOrder(999)).rejects.toThrow("Unknown order: 999");
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("refuses to refund an order that's already refunded, without calling Stripe", async () => {
    mockDb({ ...order, status: "refunded" });

    await expect(cancelOrder(order.id)).rejects.toThrow(
      `Order ${order.id} has already been refunded.`
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("marks the order refunding before calling Stripe, then refunded after", async () => {
    const { set } = mockDb(order);
    retrieve.mockResolvedValue({ payment_intent: "pi_test_456" });
    refundsCreate.mockResolvedValue({ id: "re_test_789" });

    await cancelOrder(order.id);

    expect(retrieve).toHaveBeenCalledWith(order.stripeCheckoutSessionId);
    expect(refundsCreate).toHaveBeenCalledWith({
      payment_intent: "pi_test_456",
    });
    // Two separate status writes, in order: "refunding" happens before the
    // Stripe call, "refunded" only after it succeeds.
    expect(set.mock.calls).toEqual([
      [{ status: "refunding" }],
      [{ status: "refunded" }],
    ]);
    const refundingCallOrder = set.mock.invocationCallOrder[0];
    const refundedCallOrder = set.mock.invocationCallOrder[1];
    const stripeCallOrder = refundsCreate.mock.invocationCallOrder[0];
    expect(refundingCallOrder).toBeLessThan(stripeCallOrder);
    expect(stripeCallOrder).toBeLessThan(refundedCallOrder);
  });

  it("leaves the order at 'refunding', not 'refunded', if the Stripe call fails", async () => {
    const { set } = mockDb(order);
    retrieve.mockResolvedValue({ payment_intent: "pi_test_456" });
    refundsCreate.mockRejectedValue(new Error("Stripe is down"));

    await expect(cancelOrder(order.id)).rejects.toThrow("Stripe is down");

    // The pre-write happened (so a retry can't fall through the "already
    // refunded" guard and attempt a second refund), but the order was never
    // marked "refunded", since the Stripe call itself never succeeded.
    expect(set).toHaveBeenCalledWith({ status: "refunding" });
    expect(set).not.toHaveBeenCalledWith({ status: "refunded" });
  });

  it("handles an expanded payment_intent object, not just a string id", async () => {
    mockDb(order);
    retrieve.mockResolvedValue({
      payment_intent: { id: "pi_expanded_456" },
    });
    refundsCreate.mockResolvedValue({ id: "re_test_789" });

    await cancelOrder(order.id);

    expect(refundsCreate).toHaveBeenCalledWith({
      payment_intent: "pi_expanded_456",
    });
  });

  it("refuses to refund a session with no payment intent", async () => {
    mockDb(order);
    retrieve.mockResolvedValue({ payment_intent: null });

    await expect(cancelOrder(order.id)).rejects.toThrow(
      `Checkout session ${order.stripeCheckoutSessionId} has no payment to refund.`
    );
    expect(refundsCreate).not.toHaveBeenCalled();
  });
});
