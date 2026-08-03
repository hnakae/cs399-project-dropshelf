import { auth } from "@clerk/nextjs/server";

export async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Admin authentication required.");
  }
  return userId;
}
