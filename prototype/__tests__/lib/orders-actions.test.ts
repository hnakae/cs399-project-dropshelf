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

  it("retrieves the checkout session, refunds the payment intent, and marks the order refunded", async () => {
    const { update, set, updateWhere } = mockDb(order);
    retrieve.mockResolvedValue({ payment_intent: "pi_test_456" });
    refundsCreate.mockResolvedValue({ id: "re_test_789" });

    await cancelOrder(order.id);

    expect(retrieve).toHaveBeenCalledWith(order.stripeCheckoutSessionId);
    expect(refundsCreate).toHaveBeenCalledWith({
      payment_intent: "pi_test_456",
    });
    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ status: "refunded" });
    expect(updateWhere).toHaveBeenCalled();
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
