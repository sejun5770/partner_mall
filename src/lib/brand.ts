/**
 * S2_Card.CardBrand (single char) → display name.
 *
 * Operations meaning (the legacy 매출현황 admin uses this binary split):
 *   'S' → 프리미어페이퍼
 *   any other letter → 바른손카드
 *   NULL / empty → "-"
 *
 * The catalog doc (bar_shop1/S2_CARD_CATALOG.md) lists 18 separate brand
 * lines, but for settlement / matchup purposes the partner-mall surface
 * collapses everything except 'S' under the 바른손카드 umbrella.
 */
export function brandName(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  if (!c) return "-";
  return c === "S" ? "프리미어페이퍼" : "바른손카드";
}
