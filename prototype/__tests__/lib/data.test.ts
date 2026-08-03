// Tests for the product read queries in lib/data.ts: getProducts() filters
// out archived rows, getAllProductsIncludingArchived() doesn't, and
// getProductById() returns the matching row or undefined.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("@/lib/db", () => ({ getDb }));

import {
  getAllProductsIncludingArchived,
  getProductById,
  getProducts,
  type Product,
} from "@/lib/data";

const products: Product[] = [
  {
    id: "tide-mug",
    title: "Tidepool Mug",
    description: "A hand-thrown stoneware mug.",
    priceInCents: 3200,
    imageUrl: "https://picsum.photos/seed/dropshelf-product-1/600/600",
    isArchived: false,
  },
  {
    id: "desert-bowl",
    title: "Desert Light Bowl",
    description: "A wide serving bowl.",
    priceInCents: 5800,
    imageUrl: "https://picsum.photos/seed/dropshelf-product-2/600/600",
    isArchived: false,
  },
];

function mockSelectFrom(rows: Product[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = Object.assign(Promise.resolve(rows), { where });
  const select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(from) });
  getDb.mockReturnValue({ select });
  return { where };
}

beforeEach(() => {
  getDb.mockReset();
});

describe("getProducts", () => {
  it("returns non-archived product rows from the database", async () => {
    const { where } = mockSelectFrom(products);

    await expect(getProducts()).resolves.toEqual(products);
    expect(where).toHaveBeenCalled();
  });
});

describe("getAllProductsIncludingArchived", () => {
  it("returns every product row, including archived ones", async () => {
    mockSelectFrom(products);

    await expect(getAllProductsIncludingArchived()).resolves.toEqual(products);
  });
});

describe("getProductById", () => {
  it("returns the matching product when the query finds one row", async () => {
    const { where } = mockSelectFrom(products);
    where.mockResolvedValue([products[0]]);

    await expect(getProductById("tide-mug")).resolves.toEqual(products[0]);
  });

  it("returns undefined when the query finds no rows", async () => {
    const { where } = mockSelectFrom(products);
    where.mockResolvedValue([]);

    await expect(getProductById("does-not-exist")).resolves.toBeUndefined();
  });
});
