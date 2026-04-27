import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { getMssqlPool } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "partner-mall-jwt-secret";
const TOKEN_NAME = "partner_token";

export interface PartnerUser {
  id: number;
  userId: string;
  email: string;
  partnerShopId: number;
  partnerName: string;
  isAdmin: boolean;
}

/**
 * DB-backed admin check, called at sign-in time. Two signals are checked:
 *
 *   1. The user has an active row in `ADMIN_LST` whose ADMIN_ID matches
 *      their COMPANY.LOGIN_ID. ADMIN_LST is the bar_shop1 staff table —
 *      anyone there is a 바른손 직원.
 *   2. Their COMPANY.COMPANY_NAME contains "관리자". This catches the
 *      service-level admin accounts that aren't bar_shop1 employees but
 *      are explicitly named as admins (e.g. ec_master / 바른손몰관리자).
 *
 * Either match flips isAdmin=true. The result is baked into the JWT at
 * login, so this check only runs once per session.
 */
export async function isAdminLoginId(loginId: string): Promise<boolean> {
  if (!loginId) return false;
  try {
    const pool = await getMssqlPool();
    const result = await pool
      .request()
      .input("loginId", loginId)
      .query<{ is_admin: number }>(`
        SELECT TOP 1
          CASE
            WHEN c.COMPANY_NAME LIKE N'%관리자%' THEN 1
            WHEN EXISTS (
              SELECT 1 FROM ADMIN_LST a
              WHERE a.ADMIN_ID = c.LOGIN_ID AND a.NState = 1
            ) THEN 1
            ELSE 0
          END AS is_admin
        FROM COMPANY c
        WHERE c.LOGIN_ID = @loginId
      `);
    return Number(result.recordset[0]?.is_admin ?? 0) === 1;
  } catch (err) {
    // On any failure we err on the safe side and treat the user as
    // non-admin, never the other way around.
    console.error("isAdminLoginId DB check failed:", err);
    return false;
  }
}

export function signToken(user: PartnerUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "8h" });
}

export function verifyToken(token: string): PartnerUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as PartnerUser;
  } catch {
    return null;
  }
}

/**
 * Fallback admin bypass user used while real auth is not wired up in the
 * deployed environment. COMPANY_SEQ=8294 = ec_master = 바른손몰관리자.
 */
const BYPASS_ADMIN_USER: PartnerUser = {
  id: 8294,
  userId: "ec_master",
  email: "",
  partnerShopId: 8294,
  partnerName: "[DEV] ec_master",
  isAdmin: true,
};

/**
 * Fallback non-admin (partner) bypass user. Real partner used as a fixture
 * so the settlement page has data under the 청첩장 category.
 *   COMPANY_SEQ=? / LOGIN_ID=verygood / COMPANY_NAME=베리굿웨딩.
 * The COMPANY_SEQ is looked up at runtime from sample data; until confirmed
 * we keep a stub shape here and the UI only depends on isAdmin=false plus
 * the fact that getMssqlPool() joins COMPANY by this seq.
 */
const BYPASS_PARTNER_USER: PartnerUser = {
  id: 0,
  userId: "verygood",
  email: "",
  partnerShopId: 0, // will be looked up on first use below
  partnerName: "[DEV] verygood (partner view)",
  isAdmin: false,
};

/** Cookie used by the dev "view as" toggle (see /dev/view-as/[role]). */
const DEV_VIEW_AS_COOKIE = "dev_view_as";

/**
 * Auth bypass is OFF by default in production — real login against
 * bar_shop1.COMPANY is required. Set DEV_AUTH_BYPASS=1 in the container env
 * (or .env.local for local dev) to re-enable the BYPASS_* fixtures.
 */
function isBypassEnabled(): boolean {
  return process.env.DEV_AUTH_BYPASS === "1";
}

/**
 * Returns the active bypass user, honoring the dev_view_as cookie.
 *   cookie value "partner" -> non-admin fixture
 *   anything else / absent -> admin fixture
 */
async function resolveBypassUser(): Promise<PartnerUser> {
  const cookieStore = await cookies();
  const viewAs = cookieStore.get(DEV_VIEW_AS_COOKIE)?.value;
  if (viewAs === "partner") return BYPASS_PARTNER_USER;
  return BYPASS_ADMIN_USER;
}

export async function getCurrentUser(): Promise<PartnerUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;
  if (!token) {
    return isBypassEnabled() ? resolveBypassUser() : null;
  }
  const user = verifyToken(token);
  if (!user) {
    return isBypassEnabled() ? resolveBypassUser() : null;
  }
  // Backwards-compat for tokens issued before isAdmin was added
  return { ...user, isAdmin: user.isAdmin === true };
}

export { DEV_VIEW_AS_COOKIE };

export { TOKEN_NAME };
