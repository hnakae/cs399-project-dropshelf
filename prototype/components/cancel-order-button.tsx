"use client";

import { cancelOrder } from "@/lib/orders-actions";

export function CancelOrderButton({ orderId }: { orderId: number }) {
  return (
    <form
      action={cancelOrder.bind(null, orderId)}
      onSubmit={(event) => {
        if (
          !confirm(`Cancel and refund order #${orderId}? This cannot be undone.`)
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="font-mono text-xs uppercase tracking-[0.15em] text-rust underline decoration-rust/40 underline-offset-4 transition-colors hover:decoration-rust focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Cancel &amp; Refund
      </button>
    </form>
  );
}
