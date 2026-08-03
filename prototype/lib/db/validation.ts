import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { orderItems, orders, products } from "./schema";

export const insertProductSchema = createInsertSchema(products, {
  id: (schema) =>
    schema
      .trim()
      .min(1, "Product id is required")
      .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only"),
  title: (schema) => schema.trim().min(1, "Title is required"),
  description: (schema) => schema.trim().min(1, "Description is required"),
  priceInCents: (schema) => schema.int().positive("Price must be greater than zero"),
  imageUrl: (schema) => schema.trim().url("Image URL must be a valid URL"),
});
export const selectProductSchema = createSelectSchema(products);
export const updateProductSchema = createUpdateSchema(products, {
  title: (schema) => schema.trim().min(1, "Title is required"),
  description: (schema) => schema.trim().min(1, "Description is required"),
  priceInCents: (schema) => schema.int().positive("Price must be greater than zero"),
  imageUrl: (schema) => schema.trim().url("Image URL must be a valid URL"),
}).omit({ id: true, isArchived: true });

export const insertOrderSchema = createInsertSchema(orders);
export const selectOrderSchema = createSelectSchema(orders);

export const insertOrderItemSchema = createInsertSchema(orderItems);
export const selectOrderItemSchema = createSelectSchema(orderItems);
