/**
 * S2_Card.CardBrand (single char) → display name.
 * Source: bar_shop1/S2_CARD_CATALOG.md.
 */
export const CARD_BRAND_NAME: Record<string, string> = {
  B: "바른손카드",
  C: "더카드",
  S: "비핸즈",
  X: "디어디어",
  W: "W카드",
  N: "네이처",
  I: "이니스",
  H: "비핸즈프리미엄",
  F: "플라워",
  D: "디자인카드",
  P: "프리미어페이퍼",
  M: "모바일",
  G: "글로벌",
  U: "유니세프",
  Y: "유니크",
  K: "비케이",
  T: "프리미어더카드",
  A: "기타",
};

export function brandName(code: string | null | undefined): string {
  if (!code) return "-";
  return CARD_BRAND_NAME[code] ?? code;
}
