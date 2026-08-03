// Tests for requireAdmin(): throws when there's no signed-in Clerk user,
// resolves the user id when there is one.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth }));

import { requireAdmin } from "@/lib/admin";

beforeEach(() => {
  auth.mockReset();
});

describe("requireAdmin", () => {
  it("throws when there is no signed-in user", async () => {
    auth.mockResolvedValue({ userId: null });

    await expect(requireAdmin()).rejects.toThrow(
      "Admin authentication required."
    );
  });

  it("returns the user id when a user is signed in", async () => {
    auth.mockResolvedValue({ userId: "user_123" });

    await expect(requireAdmin()).resolves.toBe("user_123");
  });
});
