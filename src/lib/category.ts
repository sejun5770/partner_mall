/**
 * Order item category derived from S2_Card.Card_Div.
 *
 * Business rules (live DB inspection 2026-04-23):
 *   thankyou   = D01           — 답례품 (e.g. 데일리너츠 선물세트, 메탈릭 코스터)
 *   goods      = D02           — 기념굿즈 / 데코소품 (꽃다발 · 유칼립투스 등)
 *   invitation = everything else — 청첩장 본체(A01) + 추가상품
 *                                   (A02-A07 봉투/감사장/스티커/식권/네임씰/포켓,
 *                                    B01-B02 봉투·라이닝, C01-C29 식권/혼인서약서/
 *                                    엽서/봉투류/리플렛/사은품 등)
 *
 * Per spec: "청첩장 = 청첩장 + 추가상품 (답례품 / 데코소품 카테고리는 제외)" —
 * so the invitation bucket is the default and only D01/D02 are carved out.
 */
export type Category = "invitation" | "thankyou" | "goods";

export const CATEGORY_LABEL: Record<Category, string> = {
  invitation: "청첩장",
  thankyou: "답례품",
  goods: "기념굿즈",
};

export function classifyCardDiv(cardDiv: string | null | undefined): Category {
  const v = (cardDiv ?? "").trim().toUpperCase();
  if (v === "D01") return "thankyou";
  if (v === "D02") return "goods";
  return "invitation";
}

/**
 * SQL fragment that returns the category string given a Card_Div column reference.
 * Keep in sync with classifyCardDiv() above.
 */
export function categoryCaseSql(cardDivExpr: string): string {
  return `CASE
    WHEN ${cardDivExpr} = 'D01' THEN 'thankyou'
    WHEN ${cardDivExpr} = 'D02' THEN 'goods'
    ELSE 'invitation'
  END`;
}
