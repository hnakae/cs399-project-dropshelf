import { auth } from "@clerk/nextjs/server";

// Defense-in-depth: don't rely solely on Clerk's public-sign-up setting
// staying disabled. Any signed-in user who isn't this specific account is
// treated the same as a signed-out one, and the check fails closed if the
// env var itself is missing rather than defaulting to "any signed-in user".
const adminUserId = process.env.ADMIN_USER_ID;

if (!adminUserId) {
  throw new Error(
    "Missing ADMIN_USER_ID environment variable. Add it to .env.local."
  );
}

export async function requireAdmin() {
  const { userId } = await auth();
  if (!userId || userId !== adminUserId) {
    throw new Error("Admin authentication required.");
  }
  return userId;
}
