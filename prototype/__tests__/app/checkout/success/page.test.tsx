// Tests for CheckoutSuccessPage, covering its four states based on the
// Stripe Checkout Session re-verified server-side (never trusting the
// redirect alone):
//   1. No `session_id` in the URL              -> "Nothing to confirm"
//   2. `session_id` Stripe can't retrieve/verify -> "Session not found"
//   3. Session found but `payment_status` isn't "paid" -> "Payment not completed"
//   4. Session found and paid                   -> "Order confirmed"

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { retrieve } = vi.hoisted(() => ({ retrieve: vi.fn() }));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { retrieve } },
  },
}));

import CheckoutSuccessPage from "@/app/checkout/success/page";

async function renderPage(sessionId?: string) {
  const element = await CheckoutSuccessPage({
    searchParams: Promise.resolve(
      sessionId ? { session_id: sessionId } : {}
    ),
  });
  render(element);
}

describe("CheckoutSuccessPage", () => {
  beforeEach(() => {
    retrieve.mockReset();
  });

  it("shows a fallback when there is no session_id in the URL", async () => {
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Nothing to confirm" })
    ).toBeInTheDocument();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("tells the buyer their payment hasn't gone through for an unpaid session", async () => {
    retrieve.mockResolvedValue({
      payment_status: "unpaid",
      line_items: { data: [{ description: "Tidepool Mug" }] },
    });

    await renderPage("cs_test_unpaid");

    expect(retrieve).toHaveBeenCalledWith("cs_test_unpaid", {
      expand: ["line_items"],
    });
    expect(
      screen.getByRole("heading", { name: "Payment not completed" })
    ).toBeInTheDocument();
  });

  it("shows a fallback instead of crashing when Stripe can't find or verify the session", async () => {
    retrieve.mockRejectedValue(
      new Error("No such checkout session: 'cs_not_a_real_session'")
    );

    await renderPage("cs_not_a_real_session");

    expect(
      screen.getByRole("heading", { name: "Session not found" })
    ).toBeInTheDocument();
  });

  it("confirms the order for a paid session, re-verified against Stripe", async () => {
    retrieve.mockResolvedValue({
      payment_status: "paid",
      line_items: { data: [{ description: "Tidepool Mug" }] },
    });

    await renderPage("cs_test_paid");

    expect(
      screen.getByRole("heading", { name: "Order confirmed" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Thanks — your Tidepool Mug is confirmed\./)
    ).toBeInTheDocument();
  });
});
