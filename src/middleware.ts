import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("partner_token")?.value;
  const { pathname } = request.nextUrl;

  // Public routes
  if (
    pathname === "/health" ||
    pathname === "/health/" ||
    pathname.startsWith("/account/signin") ||
    pathname.startsWith("/api/account/signin") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Real login is enforced by default; bypass only applies when
  // DEV_AUTH_BYPASS=1 is explicitly set (local dev, or an opt-in container
  // env var). Keep in sync with getCurrentUser() in src/lib/auth.ts.
  if (process.env.DEV_AUTH_BYPASS === "1") {
    return NextResponse.next();
  }

  // Redirect to login if no token.
  // Use request.nextUrl.clone() (NextURL) rather than `new URL(..., request.url)`
  // so that basePath is preserved when the redirect URL is emitted. Without this,
  // the browser is sent to "/account/signin" (no basePath) which the upstream
  // reverse proxy does not route to this container and can loop.
  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/account/signin";
    loginUrl.search = "";
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
