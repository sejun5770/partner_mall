import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Root page (`/` or `${basePath}/`) — send authenticated users straight to
 * /dashboard, unauthenticated ones to /account/signin. Using an auth-aware
 * redirect here (instead of always redirecting to /dashboard and letting the
 * authenticated layout redirect again) cuts one hop out of the entry flow,
 * which matters when the app sits behind a reverse proxy that can turn an
 * extra normalization round-trip into ERR_TOO_MANY_REDIRECTS.
 */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/account/signin");
}
