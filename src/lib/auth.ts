import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

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
 * Env-based admin check. Replace with a COMPANY table column lookup
 * once the actual admin flag column in bar_shop1.COMPANY is confirmed.
 * ADMIN_LOGIN_IDS is a comma-separated list of LOGIN_IDs.
 */
export function isAdminLoginId(loginId: string): boolean {
  const raw = process.env.ADMIN_LOGIN_IDS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(loginId);
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

function isBypassEnabled(): boolean {
  return process.env.DEV_AUTH_BYPASS !== "0";
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
