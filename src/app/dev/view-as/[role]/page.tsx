import { cookies } from "next/headers";
import { DEV_VIEW_AS_COOKIE } from "@/lib/auth";
import ViewAsClient from "./ViewAsClient";

/**
 * Dev-only "view as" toggle.
 *
 *   /dev/view-as/partner  -> set cookie, future requests see isAdmin=false
 *   /dev/view-as/admin    -> clear cookie, restore isAdmin=true (default)
 *
 * Works because the deployed container runs with the auth bypass ON;
 * getCurrentUser() branches on this same cookie. Cookie is session-only
 * (no maxAge) so closing the browser clears it automatically.
 *
 * Cookie is set server-side, then a client component handles navigation
 * to /dashboard (server-side redirect() is avoided because the upstream
 * proxy has been observed stripping 307 Location headers).
 */
export default async function ViewAsPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
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
