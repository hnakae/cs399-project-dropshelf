import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const password = process.env.ORDERS_VIEW_PASSWORD;
  if (!password) {
    return new NextResponse("ORDERS_VIEW_PASSWORD is not configured", {
      status: 500,
    });
  }

  const expected = `Basic ${Buffer.from(`orders:${password}`).toString("base64")}`;
  if (request.headers.get("authorization") === expected) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Orders"' },
  });
}

export const config = {
  matcher: "/orders",
};
