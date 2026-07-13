import { afterEach, describe, expect, it } from "vitest";
import { formatPrice, getBaseUrl } from "@/lib/utils";

describe("formatPrice", () => {
  it("formats whole-dollar cent amounts", () => {
    expect(formatPrice(3200)).toBe("$32.00");
  });

  it("formats sub-dollar cent amounts", () => {
    expect(formatPrice(99)).toBe("$0.99");
  });

  it("rounds to two decimal places", () => {
    expect(formatPrice(100)).toBe("$1.00");
  });
});

describe("getBaseUrl", () => {
  const original = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = original.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = original.VERCEL_URL;
  });

  it("prefers NEXT_PUBLIC_SITE_URL when set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://dropshelf.example.com";
    process.env.VERCEL_URL = "dropshelf.vercel.app";

    expect(getBaseUrl()).toBe("https://dropshelf.example.com");
  });

  it("falls back to VERCEL_URL when the site url isn't set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "dropshelf.vercel.app";

    expect(getBaseUrl()).toBe("https://dropshelf.vercel.app");
  });

  it("falls back to localhost when neither is set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;

    expect(getBaseUrl()).toBe("http://localhost:3000");
  });
});
