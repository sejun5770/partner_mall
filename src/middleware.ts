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

  // Real login is enforced. Bypass only kicks in for non-production builds
  // with DEV_AUTH_BYPASS=1 — a partner-facing container ignores the env
  // var entirely. Keep in sync with isBypassEnabled() in src/lib/auth.ts.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTH_BYPASS === "1"
  ) {
    return NextResponse.next();
  }

  // Unauthenticated: render the signin page via REWRITE instead of 307.
  //
  // The upstream reverse proxy (docker-manager.barunsoncard.com) has been
  // observed stripping the `Location` header from 307 responses — the
  // browser then sees a 200 with an empty body and shows a blank page.
  // Using rewrite keeps the user's URL in the address bar but serves the
  // signin page's HTML inline, sidestepping the Location-strip bug.
  // ReturnUrl is still propagated so the signin form can send the user
  // back to their original destination after login.
  if (!token) {
    const target = request.nextUrl.clone();
    target.pathname = "/account/signin";
    target.search = "";
    target.searchParams.set("ReturnUrl", pathname);
    return NextResponse.rewrite(target);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Explicit root so the auth rewrite fires on /c/partner/ (the index
    // page). Without this the matcher's `.*` only reliably matches
    // non-empty path segments in some Next versions and the root slipped
    // through, serving a blank body.
    "/",
    "/((?!_next/static|_next/image|favicon.ico).+)",
  ],
};
