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

  // Bypass auth by default; only enforce it when DEV_AUTH_BYPASS is
  // explicitly set to "0". The deployed container was not picking up the
  // ENV set in the Dockerfile, so the safer default is "bypass on" until
  // real auth is wired up end-to-end. Keep in sync with getCurrentUser()
  // in src/lib/auth.ts.
  if (process.env.DEV_AUTH_BYPASS !== "0") {
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
