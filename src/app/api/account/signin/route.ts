import { NextRequest, NextResponse } from "next/server";
import { getMssqlPool } from "@/lib/db";
import { signToken, TOKEN_NAME, isAdminLoginId } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { id, password } = await request.json();

  if (!id || !password) {
    return NextResponse.json(
      { message: "아이디와 비밀번호를 입력해주세요." },
      { status: 400 }
    );
  }

  try {
    const pool = await getMssqlPool();
    const result = await pool
      .request()
      .input("loginId", id)
      .query(
        `SELECT COMPANY_SEQ, LOGIN_ID, PASSWD, COMPANY_NAME, E_MAIL, STATUS
         FROM COMPANY
         WHERE LOGIN_ID = @loginId`
      );

    const user = result.recordset[0];

    if (!user || user.PASSWD !== password) {
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const token = signToken({
      id: user.COMPANY_SEQ,
      userId: user.LOGIN_ID,
      email: user.E_MAIL ?? "",
      partnerShopId: user.COMPANY_SEQ,
      partnerName: user.COMPANY_NAME ?? "",
      isAdmin: isAdminLoginId(user.LOGIN_ID),
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set(TOKEN_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
