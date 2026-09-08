export type BomLine = {
  productId: string;
  productName: string;
  qty: number;
};

export type SaleItemLike = {
  type: string;
  refId?: string | null;
  name: string;
  qty: number | string;
};

export type MaterialRecipe = {
  serviceId: string;
  productId: string;
  productName: string;
  qty: number | string;
};

/** Restore BOM quantities consumed when a service line was sold. */
export function bomRestoreLines(
  items: SaleItemLike[],
  recipes: MaterialRecipe[],
): BomLine[] {
  const byService = new Map<string, MaterialRecipe[]>();
  for (const r of recipes) {
    const list = byService.get(r.serviceId) || [];
    list.push(r);
    byService.set(r.serviceId, list);
  }

  const out: BomLine[] = [];
  for (const item of items) {
    if (item.type !== 'SERVICE' || !item.refId) continue;
    const mats = byService.get(item.refId) || [];
    for (const mat of mats) {
      out.push({
        productId: mat.productId,
        productName: mat.productName,
        qty: Number(mat.qty) * Number(item.qty),
      });
    }
  }
  return out;
}

export function giftBalanceAfterRefund(
  currentBalance: number,
  redeemed: number,
  initial: number,
) {
  const next = Math.min(initial, Number(currentBalance) + Number(redeemed));
  return {
    balance: Math.round(next * 100) / 100,
    isActive: next > 0,
  };
}

export function packageSessionsAfterRefund(
  sessionsLeft: number,
  sessionsTotal: number,
  burned: number,
) {
  const left = Math.min(sessionsTotal, sessionsLeft + burned);
  return {
    sessionsLeft: left,
    status: left <= 0 ? 'EXHAUSTED' : 'ACTIVE',
  };
}
