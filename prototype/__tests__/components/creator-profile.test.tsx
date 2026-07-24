import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CreatorProfile } from "@/components/creator-profile";
import type { Creator } from "@/lib/data";

const creator: Creator = {
  name: "Hiro Nakae",
  bio: "Ceramic artist making small-batch, wheel-thrown pottery.",
  imageUrl: "https://picsum.photos/seed/dropshelf-creator/400/400",
};

describe("CreatorProfile", () => {
  it("renders the creator's name, bio, and portrait", () => {
    render(<CreatorProfile creator={creator} />);

    expect(
      screen.getByRole("heading", { name: creator.name })
    ).toBeInTheDocument();
    expect(screen.getByText(creator.bio)).toBeInTheDocument();
    expect(screen.getByAltText(creator.name)).toBeInTheDocument();
  });
});
