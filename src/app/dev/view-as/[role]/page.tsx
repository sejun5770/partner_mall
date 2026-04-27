import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DEV_VIEW_AS_COOKIE } from "@/lib/auth";
import ViewAsClient from "./ViewAsClient";

/**
 * Dev-only "view as" toggle. Hard-disabled in production so this URL
 * 404s on the partner-facing build — the cookie it sets is read by
 * getCurrentUser() only when isBypassEnabled() returns true, which
 * is itself blocked in production, so the route would be a no-op
 * anyway. 404'ing it just removes a confusing artifact.
 *
 *   /dev/view-as/partner  -> set cookie, future requests see isAdmin=false
 *   /dev/view-as/admin    -> clear cookie, restore isAdmin=true (default)
 *
 * Cookie is session-only (no maxAge) so closing the browser clears it.
 */
export default async function ViewAsPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { role } = await params;
  const cookieStore = await cookies();

  const isPartner = role === "partner";

  if (isPartner) {
    cookieStore.set(DEV_VIEW_AS_COOKIE, "partner", {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
  } else {
    cookieStore.delete(DEV_VIEW_AS_COOKIE);
  }

  return <ViewAsClient isPartner={isPartner} />;
}
