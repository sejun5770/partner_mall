import { NextResponse } from "next/server";
import { getMssqlPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/partner
 *
 * Returns the basic 업체 정보 for the currently logged-in partner. Source
 * of truth is bar_shop1.COMPANY (same table login authenticates against).
 *
 * Auth: requires a valid session. Always scopes to user.partnerShopId —
 * even admins get their OWN COMPANY row here. (For browsing other
 * partners, the admin uses the settlement page's partner dropdown.)
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  try {
    const pool = await getMssqlPool();
    const result = await pool
      .request()
      .input("companySeq", user.partnerShopId)
      .query<{
        COMPANY_SEQ: number;
        LOGIN_ID: string;
        COMPANY_NAME: string;
        COMPANY_NUM: string | null;
        E_MAIL: string | null;
        STATUS: string | null;
        BOSS_NM: string | null;
        BOSS_TEL_NO: string | null;
        FAX_NO: string | null;
        MNG_NM: string | null;
        MNG_E_MAIL: string | null;
        MNG_TEL_NO: string | null;
        MNG_HP_NO: string | null;
        ZIP_CODE: string | null;
        FRONT_ADDR: string | null;
        BACK_ADDR: string | null;
        BANK_NM: string | null;
        ACCOUNT_NO: string | null;
        REGIST_DATE: Date | null;
      }>(`
        SELECT
          COMPANY_SEQ, LOGIN_ID, COMPANY_NAME, COMPANY_NUM,
          E_MAIL, STATUS,
          BOSS_NM, BOSS_TEL_NO, FAX_NO,
          MNG_NM, MNG_E_MAIL, MNG_TEL_NO, MNG_HP_NO,
          ZIP_CODE, FRONT_ADDR, BACK_ADDR,
          BANK_NM, ACCOUNT_NO,
          REGIST_DATE
        FROM COMPANY
        WHERE COMPANY_SEQ = @companySeq
      `);

    const row = result.recordset[0];
    if (!row) {
      return NextResponse.json({ message: "not found" }, { status: 404 });
    }

    return NextResponse.json({
      partner: {
        company_seq: row.COMPANY_SEQ,
        login_id: row.LOGIN_ID,
        company_name: row.COMPANY_NAME,
        company_num: row.COMPANY_NUM ?? "",
        email: row.E_MAIL ?? "",
        status: row.STATUS ?? "",
      },
      contact: {
        boss_name: row.BOSS_NM ?? "",
        boss_tel: row.BOSS_TEL_NO ?? "",
        fax: row.FAX_NO ?? "",
        manager_name: row.MNG_NM ?? "",
        manager_email: row.MNG_E_MAIL ?? "",
        manager_tel: row.MNG_TEL_NO ?? "",
        manager_hp: row.MNG_HP_NO ?? "",
      },
      address: {
        zip: row.ZIP_CODE ?? "",
        front: row.FRONT_ADDR ?? "",
        back: row.BACK_ADDR ?? "",
      },
      bank: {
        name: row.BANK_NM ?? "",
        account_no: row.ACCOUNT_NO ?? "",
      },
      regist_date: row.REGIST_DATE,
      is_admin: user.isAdmin,
    });
  } catch (error) {
    console.error("Partner info error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
