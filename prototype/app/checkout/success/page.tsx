import Link from "next/link";
import { stripe } from "@/lib/stripe";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    return (
      <ConfirmationShell
        title="Nothing to confirm"
        message="We couldn't find a checkout session here."
      />
    );
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  });

  const item = session.line_items?.data[0];
  const paid = session.payment_status === "paid";

  if (!paid) {
    return (
      <ConfirmationShell
        title="Payment not completed"
        message="This checkout session hasn't been paid yet. Head back to the shelf and try again."
      />
    );
  }

  return (
    <ConfirmationShell
      title="Order confirmed"
      message={`Thanks — your ${item?.description ?? "order"} is confirmed.`}
    />
  );
}

function ConfirmationShell({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-start justify-center px-6 py-24 sm:px-10">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-soft">
        Dropshelf
      </p>
      <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft">
        {message}
      </p>
      <Link
        href="/"
        className="mt-8 font-mono text-xs uppercase tracking-[0.15em] text-glaze underline decoration-glaze/40 underline-offset-4 hover:decoration-glaze focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Back to the shelf
      </Link>
    </div>
  );
}
