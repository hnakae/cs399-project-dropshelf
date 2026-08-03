import { describe, expect, it } from "vitest";
import { insertProductSchema, updateProductSchema } from "@/lib/db/validation";

const validProduct = {
  id: "tide-mug",
  title: "Tidepool Mug",
  description: "A hand-thrown stoneware mug.",
  priceInCents: 3200,
  imageUrl: "https://picsum.photos/seed/dropshelf-product-1/600/600",
};

describe("insertProductSchema", () => {
  it("accepts a well-formed product", () => {
    expect(insertProductSchema.safeParse(validProduct).success).toBe(true);
  });

  it("rejects a zero or negative price", () => {
    expect(
      insertProductSchema.safeParse({ ...validProduct, priceInCents: 0 })
        .success
    ).toBe(false);
    expect(
      insertProductSchema.safeParse({ ...validProduct, priceInCents: -100 })
        .success
    ).toBe(false);
  });

  it("rejects an empty or whitespace-only title", () => {
    expect(
      insertProductSchema.safeParse({ ...validProduct, title: "" }).success
    ).toBe(false);
    expect(
      insertProductSchema.safeParse({ ...validProduct, title: "   " }).success
    ).toBe(false);
  });

  it("rejects a non-URL image value", () => {
    expect(
      insertProductSchema.safeParse({ ...validProduct, imageUrl: "not-a-url" })
        .success
    ).toBe(false);
  });

  it("rejects an id with uppercase letters or spaces", () => {
    expect(
      insertProductSchema.safeParse({ ...validProduct, id: "Tide Mug" })
        .success
    ).toBe(false);
  });

  it("trims the title before validating", () => {
    const result = insertProductSchema.safeParse({
      ...validProduct,
      title: "  Tidepool Mug  ",
    });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("Tidepool Mug");
  });
});

describe("updateProductSchema", () => {
  it("does not accept an id or isArchived field", () => {
    const { id, ...rest } = validProduct;
    void id;
    const result = updateProductSchema.safeParse({
      ...rest,
      id: "changed-id",
      isArchived: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("id");
    expect(result.data).not.toHaveProperty("isArchived");
  });

  it("rejects a zero price on update", () => {
    const { id, ...rest } = validProduct;
    void id;
    expect(
      updateProductSchema.safeParse({ ...rest, priceInCents: 0 }).success
    ).toBe(false);
  });
});
