// Tests for requireAdmin(): throws when there's no signed-in Clerk user,
// throws when the signed-in user isn't the configured ADMIN_USER_ID (the
// defense-in-depth identity check, not just an authentication check), and
// resolves the user id when it matches.
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

  it("throws when the signed-in user is not the configured admin", async () => {
    auth.mockResolvedValue({ userId: "user_someone_else" });

    await expect(requireAdmin()).rejects.toThrow(
      "Admin authentication required."
    );
  });

  it("returns the user id when the signed-in user is the configured admin", async () => {
    auth.mockResolvedValue({ userId: process.env.ADMIN_USER_ID });

    await expect(requireAdmin()).resolves.toBe(process.env.ADMIN_USER_ID);
  });
});
