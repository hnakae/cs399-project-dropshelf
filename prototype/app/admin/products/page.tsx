import Link from "next/link";
import { archiveProduct } from "@/lib/products-actions";
import { getAllProductsIncludingArchived } from "@/lib/data";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await getAllProductsIncludingArchived();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-12 sm:px-10 sm:py-16">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-soft">
            Dropshelf
          </p>
          <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">
            Products
          </h1>
        </div>
        <Link
          href="/admin/products/new"
          className="font-mono text-xs uppercase tracking-[0.15em] text-ink-soft underline decoration-glaze/40 underline-offset-4 transition-colors hover:text-ink hover:decoration-glaze"
        >
          New product
        </Link>
      </div>

      <section className="mt-10 border-t border-line pt-10">
        {products.length === 0 ? (
          <p className="text-sm text-ink-soft">No products yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {products.map((product) => (
              <article key={product.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-6 first:pt-0">
                <div>
                  <h2 className="font-display text-2xl text-ink">
                    {product.title}
                    {product.isArchived && (
                      <span className="ml-3 font-mono text-xs uppercase tracking-[0.15em] text-rust">
                        Archived
                      </span>
                    )}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-ink-soft">
                    {product.id} · {formatPrice(product.priceInCents)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <Link
                    href={`/admin/products/${product.id}/edit`}
                    className="font-mono text-xs uppercase tracking-[0.15em] text-ink-soft underline decoration-glaze/40 underline-offset-4 transition-colors hover:text-ink hover:decoration-glaze"
                  >
                    Edit
                  </Link>
                  {!product.isArchived && (
                    <form action={archiveProduct.bind(null, product.id)}>
                      <button
                        type="submit"
                        className="font-mono text-xs uppercase tracking-[0.15em] text-ink-soft underline decoration-glaze/40 underline-offset-4 transition-colors hover:text-ink hover:decoration-glaze"
                      >
                        Archive
                      </button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
