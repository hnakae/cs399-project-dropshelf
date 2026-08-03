import { CancelOrderButton } from "@/components/cancel-order-button";
import { getOrders } from "@/lib/data";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const orders = await getOrders();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-12 sm:px-10 sm:py-16">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-soft">
        Dropshelf
      </p>
      <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">
        Orders
      </h1>

      <section className="mt-10 border-t border-line pt-10">
        {orders.length === 0 ? (
          <p className="text-sm text-ink-soft">No orders yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {orders.map((order) => (
              <article key={order.id} className="py-6 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h2 className="font-display text-2xl text-ink">
                    Order #{order.id}
                  </h2>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs uppercase tracking-[0.15em] text-ink-soft">
                      {order.status}
                    </span>
                    {order.status !== "refunded" && (
                      <CancelOrderButton orderId={order.id} />
                    )}
                  </div>
                </div>

                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-ink-soft">
                  <div>
                    <dt className="inline uppercase tracking-[0.1em]">
                      Placed{" "}
                    </dt>
                    <dd className="inline">
                      {order.createdAt.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline uppercase tracking-[0.1em]">
                      Customer{" "}
                    </dt>
                    <dd className="inline">
                      {order.customerEmail ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline uppercase tracking-[0.1em]">
                      Total{" "}
                    </dt>
                    <dd className="inline">
                      {formatPrice(order.amountTotalInCents)}
                    </dd>
                  </div>
                </dl>

                {order.items.length === 0 ? (
                  <p className="mt-4 text-sm text-rust">
                    No line items recorded for this order.
                  </p>
                ) : (
                  <ul className="mt-4 flex flex-col gap-1">
                    {order.items.map((item, index) => (
                      <li
                        key={`${order.id}-${item.productId}-${index}`}
                        className="flex justify-between text-sm text-ink"
                      >
                        <span>
                          {item.quantity} × {item.productTitle}
                        </span>
                        <span className="text-ink-soft">
                          {formatPrice(item.unitPriceInCents * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
