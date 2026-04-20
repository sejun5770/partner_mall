import { NextResponse } from "next/server";

/**
 * Health check endpoint for the Docker Manager / load balancer.
 *
 * Served at `${basePath}/health` (e.g. /c/partner/health when
 * NEXT_PUBLIC_BASE_PATH=/c/partner). Must stay public — excluded from the
 * auth middleware in src/middleware.ts.
 *
 * Returns 200 with a tiny JSON payload. Avoids any DB call so the endpoint
 * stays responsive even when upstream DBs are unreachable (the container is
 * still alive and answering HTTP, which is what the health probe checks).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { status: "ok", service: "partner_mall", ts: Date.now() },
    { status: 200 }
  );
}
