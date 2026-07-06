import Image from "next/image";
import { createCheckoutSession } from "@/lib/actions";
import type { Product } from "@/lib/data";
import { formatPrice } from "@/lib/utils";

export function ProductCard({
  product,
  index,
}: {
  product: Product;
  index: number;
}) {
  const buyProduct = createCheckoutSession.bind(null, product.id);
  const tilt = index % 2 === 0 ? "-rotate-1" : "rotate-1";

  return (
    <article className="group flex flex-col">
      <div className="relative aspect-square overflow-hidden bg-surface shadow-[0_18px_30px_-24px_rgba(35,32,25,0.45)] transition-shadow duration-300 group-hover:shadow-[0_26px_38px_-20px_rgba(35,32,25,0.5)]">
        <Image
          src={product.imageUrl}
          alt={product.title}
          fill
          sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
          className="object-cover grayscale transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-glaze opacity-20 mix-blend-multiply" />
      </div>

      <h3 className="mt-5 font-display text-2xl leading-tight text-ink">
        {product.title}
      </h3>
      <p className="mt-2 max-w-[28ch] text-sm leading-relaxed text-ink-soft">
        {product.description}
      </p>

      <form action={buyProduct} className="mt-4 self-start">
        <button
          type="submit"
          className={`relative inline-flex items-center gap-3 border border-ink/20 bg-surface py-2 pl-6 pr-4 font-mono text-xs uppercase tracking-[0.15em] text-ink transition-all duration-200 ${tilt} hover:rotate-0 hover:border-glaze hover:bg-glaze hover:text-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-bg`}
        >
          <span
            aria-hidden
            className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-ink/20 bg-bg"
          />
          <span>{formatPrice(product.priceInCents)}</span>
          <span className="text-ink-soft group-hover:text-inherit">
            — Buy
          </span>
        </button>
      </form>
    </article>
  );
}
