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
