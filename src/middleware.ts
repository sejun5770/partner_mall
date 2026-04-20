import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("partner_token")?.value;
  const { pathname } = request.nextUrl;

  // Public routes
  if (
    pathname === "/health" ||
    pathname.startsWith("/account/signin") ||
    pathname.startsWith("/api/account/signin") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  if (process.env.DEV_AUTH_BYPASS === "1") {
    return NextResponse.next();
  }

  // Redirect to login if no token
  if (!token) {
    const loginUrl = new URL("/account/signin", request.url);
    loginUrl.searchParams.set("ReturnUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
