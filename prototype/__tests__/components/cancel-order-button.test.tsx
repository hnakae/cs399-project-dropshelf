import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cancelOrder } = vi.hoisted(() => ({ cancelOrder: vi.fn() }));

vi.mock("@/lib/orders-actions", () => ({ cancelOrder }));

import { CancelOrderButton } from "@/components/cancel-order-button";

beforeEach(() => {
  cancelOrder.mockReset();
  cancelOrder.mockResolvedValue(undefined);
});

describe("CancelOrderButton", () => {
  it("renders a Cancel & Refund submit button", () => {
    render(<CancelOrderButton orderId={42} />);

    const button = screen.getByRole("button", { name: /Cancel & Refund/i });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).toBeInTheDocument();
  });

  it("does not submit when the confirmation dialog is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CancelOrderButton orderId={42} />);

    fireEvent.submit(screen.getByRole("button").closest("form")!);

    expect(window.confirm).toHaveBeenCalledWith(
      "Cancel and refund order #42? This cannot be undone."
    );
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it("submits when the confirmation dialog is accepted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CancelOrderButton orderId={42} />);

    fireEvent.submit(screen.getByRole("button").closest("form")!);

    await vi.waitFor(() => {
      expect(cancelOrder).toHaveBeenCalledWith(42, expect.any(FormData));
    });
  });
});
