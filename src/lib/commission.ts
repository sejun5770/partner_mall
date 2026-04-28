/**
 * Commission helpers.
 *
 * Per-company rate now lives in `COMPANY.feeRate` (float, percent value).
 * Distribution observed in bar_shop1 across active settlement partners:
 *   feeType=1, feeRate=10|13|15|5.5|23 ... (the contract rate)
 *   feeType=0, feeRate=0                 (no commission contract)
 *   feeType=NULL, feeRate=NULL           (inactive companies)
 *
 * Resolution rule used by both the list query and the per-company summary
 * aggregation: COALESCE(c.feeRate, 0) — a missing rate defaults to 0%, not
 * to the env value, so an inactive company surfacing in settlement never
 * pays out an invented amount. Live in SQL so we can aggregate in one
 * round-trip without an N+1 lookup; the constants below are used only by
 * code paths outside the settlement queries (none exist today).
 *
 * If a hard fallback ever needs to re-enter, set DEFAULT_COMMISSION_RATE
 * in the deploy env and call getDefaultCommissionRate().
 */
export function getDefaultCommissionRate(): number {
  const raw = process.env.DEFAULT_COMMISSION_RATE;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function calcCommission(amount: number, ratePct: number): number {
  return Math.floor((amount * ratePct) / 100);
}
