/**
 * Commission rate lookup.
 *
 * The actual COMPANY column for partner commission rate is unconfirmed.
 * For now this returns a configurable default via env (`DEFAULT_COMMISSION_RATE`,
 * percent integer). Once the COMPANY column is known, swap this single
 * function to pull from the row and the rest of the code stays unchanged.
 */
export function getCommissionRate(_companySeq: number): number {
  const raw = process.env.DEFAULT_COMMISSION_RATE;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 10;
}

export function calcCommission(amount: number, ratePct: number): number {
  return Math.floor((amount * ratePct) / 100);
}
