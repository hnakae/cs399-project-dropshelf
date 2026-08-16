// Tests for ProductCard: shows the product's title, description, and
// formatted price, and wires the Buy button to a real submit action
// (form + button type="submit"), not a plain link.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/data";
import { formatPrice } from "@/lib/utils";

const product: Product = {
  id: "tide-mug",
  title: "Tidepool Mug",
  description:
    "A hand-thrown stoneware mug glazed in layered blues and greens, each one a little different from the last.",
  priceInCents: 3200,
  imageUrl: "https://picsum.photos/seed/dropshelf-product-1/600/600",
  isArchived: false,
};

describe("ProductCard", () => {
  it("shows the product's title, description, and formatted price", () => {
    render(<ProductCard product={product} index={0} />);

    expect(
      screen.getByRole("heading", { name: product.title })
    ).toBeInTheDocument();
    expect(screen.getByText(product.description)).toBeInTheDocument();
    expect(
      screen.getByText(formatPrice(product.priceInCents))
    ).toBeInTheDocument();
  });

  it("wires the Buy button to a submit action for this product, not a plain link", () => {
    render(<ProductCard product={product} index={0} />);

    const buyButton = screen.getByRole("button", { name: /Buy/ });
    expect(buyButton).toHaveAttribute("type", "submit");
    expect(buyButton.closest("form")).toBeInTheDocument();
  });
});
