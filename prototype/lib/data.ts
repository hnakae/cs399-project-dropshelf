export interface Creator {
  name: string;
  bio: string;
  imageUrl: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  priceInCents: number;
  imageUrl: string;
}

export const creator: Creator = {
  name: "Mira Alvarez",
  bio: "Ceramic artist making small-batch, wheel-thrown pottery inspired by tidepools and desert light. Every piece is fired in a single kiln in Tucson, Arizona.",
  imageUrl: "https://picsum.photos/seed/dropshelf-creator/400/400",
};

export const products: Product[] = [
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

export function getProductById(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}
