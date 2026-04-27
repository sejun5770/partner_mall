/**
 * Order item category derived from S2_Card.Card_Div + Card_Code.
 *
 * Card_Div alone is not enough to distinguish 데코소품 from 추가상품 because
 * C29 mixes them — posters, acrylic standees, calendars, magazines, flowers
 * (clearly 데코/기념굿즈) sit alongside paper bags and stickers (추가상품).
 * So we layer Card_Code prefix rules on top of the Card_Div mapping.
 *
 * Resulting rules (live DB inspection 2026-04-23):
 *
 *   goods (기념굿즈 / 데코소품):
 *     - Card_Div = 'D02'
 *     - Card_Code starts with 2026_poster_     (웨딩 포스터)
 *     - Card_Code starts with 2026_acryl_      (아크릴 등신대)
 *     - Card_Code starts with 2026_Fabric_     (패브릭 포스터)
 *     - Card_Code starts with 2026_calendar    (캘린더)
 *     - Card_Code starts with 2026_NEWSPAPER   (웨딩 매거진/타임즈/특집호)
 *     - Card_Code starts with 2026_flower      (생화·드라이플라워 등 데코 식물)
 *     - Card_Code starts with magnet_          (마그넷)
 *     - Card_Code starts with puzzle           (퍼즐)
 *
 *   thankyou (답례품):
 *     - Card_Div = 'D01' (기프트 세트 / 코스터 등)
 *
 *   invitation (청첩장 + 추가상품):
 *     - everything else (A* 청첩장 본체 / 봉투 / 감사장 / 스티커 / 식권 /
 *       혼인서약서 / 종이봉투(2026pb_*) / 청첩장스티커(2026_sticker_*) 등)
 */
export type Category = "invitation" | "thankyou" | "goods";

export const CATEGORY_LABEL: Record<Category, string> = {
  invitation: "청첩장",
  thankyou: "답례품",
  goods: "기념굿즈",
};

const GOODS_CODE_PREFIXES = [
  "2026_poster_",
  "2026_acryl_",
  "2026_Fabric_",
  "2026_calendar",
  "2026_NEWSPAPER",
  "2026_flower",
  "magnet_",
  "puzzle",
];

export function classifyCard(
  cardDiv: string | null | undefined,
  cardCode: string | null | undefined
): Category {
  const div = (cardDiv ?? "").trim().toUpperCase();
  const code = (cardCode ?? "").trim();

  if (div === "D02") return "goods";
  for (const prefix of GOODS_CODE_PREFIXES) {
    if (code.startsWith(prefix)) return "goods";
  }
  if (div === "D01") return "thankyou";
  return "invitation";
}

/**
 * SQL CASE returning the category given a Card_Div column expression and a
 * Card_Code column expression. Keep in sync with classifyCard() above.
 *
 * `[_]` escapes the literal underscore in T-SQL LIKE; otherwise `_` is a
 * single-char wildcard.
 */
export function categoryCaseSql(
  cardDivExpr: string,
  cardCodeExpr: string
): string {
  return `CASE
    WHEN ${cardDivExpr} = 'D02' THEN 'goods'
    WHEN ${cardCodeExpr} LIKE '2026[_]poster[_]%'    THEN 'goods'
    WHEN ${cardCodeExpr} LIKE '2026[_]acryl[_]%'     THEN 'goods'
    WHEN ${cardCodeExpr} LIKE '2026[_]Fabric[_]%'    THEN 'goods'
    WHEN ${cardCodeExpr} LIKE '2026[_]calendar%'     THEN 'goods'
    WHEN ${cardCodeExpr} LIKE '2026[_]NEWSPAPER%'    THEN 'goods'
    WHEN ${cardCodeExpr} LIKE '2026[_]flower%'       THEN 'goods'
    WHEN ${cardCodeExpr} LIKE 'magnet[_]%'           THEN 'goods'
    WHEN ${cardCodeExpr} LIKE 'puzzle%'              THEN 'goods'
    WHEN ${cardDivExpr} = 'D01' THEN 'thankyou'
    ELSE 'invitation'
  END`;
}

/** @deprecated kept for any old import paths; prefer classifyCard. */
export function classifyCardDiv(cardDiv: string | null | undefined): Category {
  return classifyCard(cardDiv, null);
}
