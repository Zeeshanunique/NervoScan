import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get("nervoscan_token")?.value;

  // Protect admin routes - just check if token exists (validation happens client-side)
  if (pathname.startsWith("/admin")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login?redirect=/admin", request.url));
    }
  }

  // Protect reports routes
  if (pathname.startsWith("/reports")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login?redirect=/reports", request.url));
    }
  }

  // Protect assessment routes
  if (pathname.startsWith("/assessment")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login?redirect=/assessment", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/reports/:path*", "/assessment/:path*"],
};
