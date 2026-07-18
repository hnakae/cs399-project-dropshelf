import { CreatorProfile } from "@/components/creator-profile";
import { ProductCard } from "@/components/product-card";
import { creator, getProducts } from "@/lib/data";

export default async function HomePage() {
  const products = await getProducts();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-12 sm:px-10 sm:py-16">
      <CreatorProfile creator={creator} />

      <section className="mt-14 border-t border-line pt-10 sm:mt-20 sm:pt-14">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
          On the shelf
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
