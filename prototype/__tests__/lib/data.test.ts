import { describe, expect, it } from "vitest";
import { getProductById, products } from "@/lib/data";

describe("products", () => {
  it("has unique, non-empty ids and positive prices", () => {
    const ids = products.map((product) => product.id);

    expect(products.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const product of products) {
      expect(product.id).not.toBe("");
      expect(product.priceInCents).toBeGreaterThan(0);
    }
  });
});

describe("getProductById", () => {
  it("returns the matching product for a known id", () => {
    expect(getProductById("tide-mug")).toEqual(
      products.find((product) => product.id === "tide-mug")
    );
  });

  it("returns undefined for an unknown id", () => {
    expect(getProductById("does-not-exist")).toBeUndefined();
  });
});
