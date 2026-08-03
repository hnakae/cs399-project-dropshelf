"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./admin";
import { getDb } from "./db";
import { products } from "./db/schema";
import { insertProductSchema, updateProductSchema } from "./db/validation";

export async function createProduct(formData: FormData) {
  await requireAdmin();

  const parsed = insertProductSchema.parse({
    id: formData.get("id"),
    title: formData.get("title"),
    description: formData.get("description"),
    priceInCents: Number(formData.get("priceInCents")),
    imageUrl: formData.get("imageUrl"),
  });

  await getDb().insert(products).values(parsed);

  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function updateProduct(id: string, formData: FormData) {
  await requireAdmin();

  const parsed = updateProductSchema.parse({
    title: formData.get("title"),
    description: formData.get("description"),
    priceInCents: Number(formData.get("priceInCents")),
    imageUrl: formData.get("imageUrl"),
  });

  await getDb().update(products).set(parsed).where(eq(products.id, id));

  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function archiveProduct(id: string) {
  await requireAdmin();

  await getDb()
    .update(products)
    .set({ isArchived: true })
    .where(eq(products.id, id));

  revalidatePath("/admin/products");
  revalidatePath("/");
}
