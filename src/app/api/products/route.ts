import { NextRequest, NextResponse } from "next/server";
import { getMssqlPool } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const cardCode = searchParams.get("cardCode");
  const cardName = searchParams.get("cardName");
  const cardBrand = searchParams.get("cardBrand");
  const cardDiv = searchParams.get("cardDiv");
  const displayYorn = searchParams.get("displayYorn");

  try {
    const pool = await getMssqlPool();

    let whereClause = "WHERE 1=1";
    const request_query = pool.request();

    if (cardCode) {
      whereClause += " AND Card_Code LIKE @cardCode";
      request_query.input("cardCode", `%${cardCode}%`);
    }
    if (cardName) {
      whereClause += " AND Card_Name LIKE @cardName";
      request_query.input("cardName", `%${cardName}%`);
    }
    if (cardBrand) {
      whereClause += " AND CardBrand = @cardBrand";
      request_query.input("cardBrand", cardBrand);
    }
    if (cardDiv) {
      whereClause += " AND Card_Div = @cardDiv";
      request_query.input("cardDiv", cardDiv);
    }
    if (displayYorn) {
      whereClause += " AND DISPLAY_YORN = @displayYorn";
      request_query.input("displayYorn", displayYorn);
    }

    // Count
    const countResult = await request_query.query(
      `SELECT COUNT(*) as total FROM S2_Card WITH (NOLOCK) ${whereClause}`
    );
    const total = countResult.recordset[0].total;

    // Data with pagination
    const offset = (page - 1) * pageSize;
    const request_data = pool.request();
    if (cardCode) request_data.input("cardCode", `%${cardCode}%`);
    if (cardName) request_data.input("cardName", `%${cardName}%`);
    if (cardBrand) request_data.input("cardBrand", cardBrand);
    if (cardDiv) request_data.input("cardDiv", cardDiv);
    if (displayYorn) request_data.input("displayYorn", displayYorn);
    request_data.input("offset", offset);
    request_data.input("pageSize", pageSize);

    const dataResult = await request_data.query(
      `SELECT Card_Seq, Card_Code, Card_Name, CardBrand, Card_Div,
              Card_Price, CardSet_Price, DISPLAY_YORN, Card_Image, RegDate
       FROM S2_Card WITH (NOLOCK)
       ${whereClause}
       ORDER BY RegDate DESC
       OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`
    );

    return NextResponse.json({
      products: dataResult.recordset,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Products fetch error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
