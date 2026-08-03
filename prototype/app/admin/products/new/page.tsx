import { createProduct } from "@/lib/products-actions";

const inputClassName =
  "mt-1 w-full border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";
const labelClassName =
  "font-mono text-xs uppercase tracking-[0.15em] text-ink-soft";

export default function NewProductPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12 sm:px-10 sm:py-16">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-soft">
        Dropshelf
      </p>
      <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">
        New product
      </h1>

      <form action={createProduct} className="mt-10 flex flex-col gap-6">
        <label className={labelClassName}>
          Id (slug)
          <input
            name="id"
            required
            placeholder="tide-mug"
            className={inputClassName}
          />
        </label>
        <label className={labelClassName}>
          Title
          <input name="title" required className={inputClassName} />
        </label>
        <label className={labelClassName}>
          Description
          <textarea
            name="description"
            required
            rows={4}
            className={inputClassName}
          />
        </label>
        <label className={labelClassName}>
          Price (cents)
          <input
            name="priceInCents"
            type="number"
            min={1}
            required
            className={inputClassName}
          />
        </label>
        <label className={labelClassName}>
          Image URL
          <input
            name="imageUrl"
            type="url"
            required
            className={inputClassName}
          />
        </label>

        <button
          type="submit"
          className="mt-4 self-start border border-ink/20 bg-surface px-6 py-2 font-mono text-xs uppercase tracking-[0.15em] text-ink transition-colors hover:border-glaze hover:bg-glaze hover:text-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Create product
        </button>
      </form>
    </div>
  );
}
