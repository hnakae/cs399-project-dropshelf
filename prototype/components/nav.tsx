import Link from "next/link";

export function Nav() {
  return (
    <nav className="border-b border-line">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5 sm:px-10">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-[0.25em] text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Dropshelf
        </Link>
        <Link
          href="/orders"
          className="font-mono text-xs uppercase tracking-[0.15em] text-ink-soft underline decoration-glaze/40 underline-offset-4 transition-colors hover:text-ink hover:decoration-glaze focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Orders
        </Link>
      </div>
    </nav>
  );
}
