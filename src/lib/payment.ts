/**
 * Payment method/detail resolver from PG result fields.
 *
 *   pg_resultinfo  — bank/card name or "간편결제 <provider>"
 *   pg_resultinfo2 — extra context (auth number, simple-pay provider)
 *
 * Live distribution of shipped 2026-04 orders confirmed against bar_shop1:
 *   신용카드          1559   (NH농협카드 / KB국민카드 / VISA …)
 *   간편결제          1416   (간편결제 네이버페이 / 카카오페이 …)
 *   가상계좌           602   (은행 + 계좌번호 + 입금자명)
 *   실시간계좌이체     229   (은행 only, no account)
 *
 * Heuristics — checked against the live distribution; ordering matters
 * (간편결제 wins over 카드 because a card number is often the funding
 * source for a simple-pay).
 *
 * pay_Type column is intentionally ignored: ~100% of partner-flow orders
 * carry pay_Type='0' regardless of the actual rail, so it's no signal.
 */
export interface PaymentClassification {
  method: string;
  detail: string;
}

export function classifyPayment(
  info: string | null | undefined,
  info2: string | null | undefined
): PaymentClassification {
  const a = (info ?? "").trim();
  const b = (info2 ?? "").trim();
  const detail = [a, b].filter(Boolean).join(" ").trim();
  const both = `${a} ${b}`;

  if (
    a.startsWith("간편결제") ||
    /(?:네이버페이|카카오페이|토스페이|페이코|SSGPAY|애플페이|삼성페이|LPAY|KPAY)/.test(both)
  ) {
    return { method: "간편결제", detail };
  }
  if (/카드/.test(a) || /^(?:VISA|MASTER|AMEX|JCB)/i.test(a)) {
    return { method: "신용카드", detail };
  }
  if (/(?:은행|뱅크|신협|새마을금고|우체국)/.test(a)) {
    // 가상계좌: long account number AND a Korean depositor name in
    // pg_resultinfo (e.g. "iM뱅크 9600804499517 권민희"). Plain bank
    // name only ("KB국민은행") = 실시간계좌이체.
    if (/\d{10,}/.test(a) && /[가-힣]+\s*$/.test(a)) {
      return { method: "가상계좌", detail };
    }
    return { method: "실시간계좌이체", detail };
  }
  return { method: detail ? "기타" : "", detail };
}
