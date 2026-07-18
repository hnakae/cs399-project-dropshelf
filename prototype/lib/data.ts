import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { products as productsTable } from "./db/schema";

export interface Creator {
  name: string;
  bio: string;
  imageUrl: string;
}

export type Product = typeof productsTable.$inferSelect;

export const creator: Creator = {
  name: "Hiro Nakae",
  bio: "Ceramic artist making small-batch, wheel-thrown pottery inspired by tidepools and desert light. Every piece is fired in a single kiln in Tucson, Arizona.",
  imageUrl: "https://picsum.photos/seed/dropshelf-creator/400/400",
};

export async function getProducts(): Promise<Product[]> {
  return getDb().select().from(productsTable);
}

export async function getProductById(
  id: string
): Promise<Product | undefined> {
  const [product] = await getDb()
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, id));
  return product;
}
