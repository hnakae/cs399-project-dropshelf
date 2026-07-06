import Image from "next/image";
import type { Creator } from "@/lib/data";

export function CreatorProfile({ creator }: { creator: Creator }) {
  return (
    <header className="flex flex-col gap-8 sm:flex-row sm:items-start">
      <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border border-line sm:h-40 sm:w-40">
        <Image
          src={creator.imageUrl}
          alt={creator.name}
          fill
          sizes="160px"
          className="object-cover grayscale"
          priority
        />
        <div className="absolute inset-0 bg-glaze opacity-20 mix-blend-multiply" />
      </div>
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-soft">
          Dropshelf
        </p>
        <h1 className="mt-2 font-display text-4xl leading-none text-ink sm:text-5xl">
          {creator.name}
        </h1>
        <div className="mt-4 h-px w-16 bg-glaze" />
        <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">
          {creator.bio}
        </p>
      </div>
    </header>
  );
}
