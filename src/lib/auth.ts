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

export async function getCurrentUser(): Promise<PartnerUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;
  if (!token) {
    if (process.env.DEV_AUTH_BYPASS === "1") {
      return {
        id: 8294,
        userId: "ec_master",
        email: "",
        partnerShopId: 8294,
        partnerName: "[DEV] ec_master",
        isAdmin: process.env.DEV_ADMIN === "1",
      };
    }
    return null;
  }
  const user = verifyToken(token);
  if (!user) return null;
  // Backwards-compat for tokens issued before isAdmin was added
  return { ...user, isAdmin: user.isAdmin === true };
}

export { TOKEN_NAME };
