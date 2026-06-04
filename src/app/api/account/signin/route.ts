import { NextRequest, NextResponse } from "next/server";
import { getMssqlPool } from "@/lib/db";
import { signToken, TOKEN_NAME, isAdminLoginId, defaultLandingFor } from "@/lib/auth";

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
    // LOGIN_ID 가 COMPANY 테이블에서 unique 가 아닙니다. 실측 기준 약 250개
    // 아이디가 2~4개 행에 걸쳐 중복되어 있고, 보통 "구 계정(STATUS='S3') +
    // 현 계정(STATUS='S2')" 조합입니다. 예전 쿼리는 LOGIN_ID 만 보고
    // recordset[0] 을 사용했는데, MSSQL 이 ORDER BY 없이 어떤 행을 먼저
    // 돌려줄지 보장하지 않아 다음과 같은 실패가 빈발했습니다:
    //   - SEQ=7793 블랑드봄(bom/bom, S2) 로그인 시 SEQ=2583 오월의신부
    //     (bom/6648, S3) 가 먼저 잡혀 "비밀번호 불일치" 또는 "비활성 계정"
    //     으로 거절.
    // 그래서 SELECT 단계에서 PASSWD + STATUS='S2' 까지 필터링하고,
    // 안전망으로 가장 최신(SEQ 큰) 활성 행을 고릅니다. 아래 user.PASSWD
    // / user.STATUS 검사는 이중방어로 그대로 유지.
    const result = await pool
      .request()
      .input("loginId", id)
      .input("password", password)
      .query(
        `SELECT TOP 1 COMPANY_SEQ, LOGIN_ID, PASSWD, COMPANY_NAME, E_MAIL, STATUS
         FROM COMPANY
         WHERE LOGIN_ID = @loginId
           AND PASSWD   = @password
           AND STATUS   = 'S2'
         ORDER BY COMPANY_SEQ DESC`
      );

    const user = result.recordset[0];

    if (!user || user.PASSWD !== password) {
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    // STATUS='S2' 만 SELECT 했으므로 여기서는 항상 통과하지만, SELECT
    // 조건이 미래에 바뀔 경우를 대비해 명시적 가드 유지.
    // (S1=대기, S3=비활성, '' / NULL = 정의되지 않음 → 모두 거절)
    if (user.STATUS !== "S2") {
      return NextResponse.json(
        { message: "비활성 계정입니다. 관리자에게 문의해주세요." },
        { status: 403 }
      );
    }

    const isAdmin = await isAdminLoginId(user.LOGIN_ID);
    const partnerUser = {
      id: user.COMPANY_SEQ,
      userId: user.LOGIN_ID,
      email: user.E_MAIL ?? "",
      partnerShopId: user.COMPANY_SEQ,
      partnerName: user.COMPANY_NAME ?? "",
      isAdmin,
    };
    const token = signToken(partnerUser);

    // Tells the LoginForm where to send the user — defaults to /settlement
    // but special-role accounts (e.g. casamia_mkt) get their dedicated
    // landing page instead.
    const landing = defaultLandingFor(partnerUser);

    const response = NextResponse.json({ success: true, landing });
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
