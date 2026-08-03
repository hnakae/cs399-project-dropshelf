// Tests for the product admin actions (createProduct, updateProduct,
// archiveProduct): each requires admin and validates input before ever
// touching the database, and each performs the expected insert/update once
// admin + validation pass.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, getDb } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin }));
vi.mock("@/lib/db", () => ({ getDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  archiveProduct,
  createProduct,
  updateProduct,
} from "@/lib/products-actions";

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

const validProductFields = {
  id: "tide-mug",
  title: "Tidepool Mug",
  description: "A hand-thrown stoneware mug.",
  priceInCents: "3200",
  imageUrl: "https://picsum.photos/seed/dropshelf-product-1/600/600",
};

function mockInsert() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });
  getDb.mockReturnValue({ insert });
  return { insert, values };
}

function mockUpdate() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  getDb.mockReturnValue({ update });
  return { update, set, where };
}

beforeEach(() => {
  requireAdmin.mockReset();
  getDb.mockReset();
  requireAdmin.mockResolvedValue("user_123");
});

describe("createProduct", () => {
  it("requires admin before touching the database", async () => {
    requireAdmin.mockRejectedValue(new Error("Admin authentication required."));
    const { insert } = mockInsert();

    await expect(createProduct(formData(validProductFields))).rejects.toThrow(
      "Admin authentication required."
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the database", async () => {
    const { insert } = mockInsert();

    await expect(
      createProduct(formData({ ...validProductFields, priceInCents: "0" }))
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts a validated product", async () => {
    const { insert, values } = mockInsert();

    await createProduct(formData(validProductFields));

    expect(insert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "tide-mug",
        title: "Tidepool Mug",
        priceInCents: 3200,
      })
    );
  });
});

describe("updateProduct", () => {
  it("requires admin before touching the database", async () => {
    requireAdmin.mockRejectedValue(new Error("Admin authentication required."));
    const { update } = mockUpdate();

    await expect(
      updateProduct("tide-mug", formData(validProductFields))
    ).rejects.toThrow("Admin authentication required.");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the database", async () => {
    const { update } = mockUpdate();

    await expect(
      updateProduct(
        "tide-mug",
        formData({ ...validProductFields, title: "" })
      )
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it("updates a validated product", async () => {
    const { set } = mockUpdate();

    await updateProduct("tide-mug", formData(validProductFields));

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tidepool Mug", priceInCents: 3200 })
    );
  });
});

describe("archiveProduct", () => {
  it("requires admin before touching the database", async () => {
    requireAdmin.mockRejectedValue(new Error("Admin authentication required."));
    const { update } = mockUpdate();

    await expect(archiveProduct("tide-mug")).rejects.toThrow(
      "Admin authentication required."
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("sets isArchived to true", async () => {
    const { set } = mockUpdate();

    await archiveProduct("tide-mug");

    expect(set).toHaveBeenCalledWith({ isArchived: true });
  });
});
