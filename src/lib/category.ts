/**
 * Order item category derived from S2_Card.Card_Div.
 *
 * Mapping (per business spec):
 *   invitation = A01 (일반청첩장)
 *   thankyou   = A03 (감사장, 카드형답례 등)
 *   goods      = 그 외 모든 Card_Div (B01 포토북/앨범, 봉투, 스티커, 식권/부속, C01~C29 등)
 *
 * If Card_Div is NULL (no items matched), the order is classified as "goods" as
 * a safe default — it will not appear in invitation/thankyou filtered views.
 */
export type Category = "invitation" | "thankyou" | "goods";

export const CATEGORY_LABEL: Record<Category, string> = {
  invitation: "청첩장",
  thankyou: "답례품",
  goods: "기념굿즈",
};

export function classifyCardDiv(cardDiv: string | null | undefined): Category {
  const v = (cardDiv ?? "").trim().toUpperCase();
  if (v === "A01") return "invitation";
  if (v === "A03") return "thankyou";
  return "goods";
}

/**
 * SQL fragment that returns the category string given a Card_Div column reference.
 * Keep in sync with classifyCardDiv() above.
 */
export function categoryCaseSql(cardDivExpr: string): string {
  return `CASE
    WHEN ${cardDivExpr} = 'A01' THEN 'invitation'
    WHEN ${cardDivExpr} = 'A03' THEN 'thankyou'
    ELSE 'goods'
  END`;
}
