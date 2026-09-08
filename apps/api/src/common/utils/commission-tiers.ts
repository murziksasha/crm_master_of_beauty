export type CommissionTier = {
  minRevenue: number;
  pct: number;
};

export function parseCommissionTiers(raw: unknown): CommissionTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => ({
      minRevenue: Number((t as CommissionTier).minRevenue),
      pct: Number((t as CommissionTier).pct),
    }))
    .filter((t) => Number.isFinite(t.minRevenue) && Number.isFinite(t.pct))
    .sort((a, b) => a.minRevenue - b.minRevenue);
}

/** Progressive: highest matching threshold wins for the whole service revenue. */
export function effectiveServiceCommissionPct(
  baselinePct: number,
  serviceRevenue: number,
  tiers: CommissionTier[],
) {
  let pct = baselinePct;
  for (const t of tiers) {
    if (serviceRevenue >= t.minRevenue) pct = t.pct;
  }
  return pct;
}

export function calcStaffCommission(params: {
  serviceRevenue: number;
  productRevenue: number;
  servicePct: number;
  productPct: number;
  tiers?: CommissionTier[];
}) {
  const servicePct = effectiveServiceCommissionPct(
    params.servicePct,
    params.serviceRevenue,
    params.tiers || [],
  );
  const serviceCommission = (params.serviceRevenue * servicePct) / 100;
  const productCommission = (params.productRevenue * (params.productPct || 0)) / 100;
  return {
    servicePct,
    productPct: params.productPct || 0,
    commission: Math.round((serviceCommission + productCommission) * 100) / 100,
  };
}
