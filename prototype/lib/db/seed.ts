import { getDb } from "./index";
import { products } from "./schema";

const seedProducts = [
  {
    id: "tide-mug",
    title: "Tidepool Mug",
    description:
      "A hand-thrown stoneware mug glazed in layered blues and greens, each one a little different from the last.",
    priceInCents: 3200,
    imageUrl: "https://picsum.photos/seed/dropshelf-product-1/600/600",
  },
  {
    id: "desert-bowl",
    title: "Desert Light Bowl",
    description:
      "A wide serving bowl with a warm, sand-toned glaze that catches the light at the table.",
    priceInCents: 5800,
    imageUrl: "https://picsum.photos/seed/dropshelf-product-2/600/600",
  },
  {
    id: "moon-vase",
    title: "Moon Vase",
    description:
      "A minimalist bud vase with a soft matte white finish, sized for a single stem.",
    priceInCents: 4400,
    imageUrl: "https://picsum.photos/seed/dropshelf-product-3/600/600",
  },
];

async function seed() {
  const db = getDb();

  for (const product of seedProducts) {
    await db
      .insert(products)
      .values(product)
      .onConflictDoUpdate({ target: products.id, set: product });
  }

  console.log(`Seeded ${seedProducts.length} products.`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
