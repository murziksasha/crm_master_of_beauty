import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireJwtSecret, resolveCorsOrigin } from './env-security';
import { calcStaffCommission, parseCommissionTiers } from './commission-tiers';

describe('JWT secret policy', () => {
  it('allows fallback only in development/test', () => {
    assert.equal(requireJwtSecret('JWT_ACCESS_SECRET', undefined, 'development'), 'dev-secret');
    assert.equal(requireJwtSecret('JWT_ACCESS_SECRET', undefined, 'test'), 'dev-secret');
  });

  it('throws in production when missing or short', () => {
    assert.throws(() => requireJwtSecret('JWT_ACCESS_SECRET', undefined, 'production'));
    assert.throws(() => requireJwtSecret('JWT_ACCESS_SECRET', 'dev-secret', 'production'));
    assert.throws(() => requireJwtSecret('JWT_ACCESS_SECRET', 'short', 'production'));
    assert.equal(
      requireJwtSecret('JWT_ACCESS_SECRET', 'a'.repeat(32), 'production'),
      'a'.repeat(32),
    );
  });
});

describe('CORS origin policy', () => {
  it('does not reflect any origin in production without CORS_ORIGIN', () => {
    assert.equal(resolveCorsOrigin(undefined, 'production'), false);
  });

  it('parses a comma-separated allowlist', () => {
    const origins = resolveCorsOrigin('https://salon.ua, https://www.salon.ua', 'production');
    assert.deepEqual(origins, ['https://salon.ua', 'https://www.salon.ua']);
  });
});

describe('tiered commissions', () => {
  it('applies product commission separately from services', () => {
    const r = calcStaffCommission({
      serviceRevenue: 10000,
      productRevenue: 2000,
      servicePct: 40,
      productPct: 10,
    });
    assert.equal(r.commission, 4200);
  });

  it('upgrades service pct when monthly revenue crosses a tier', () => {
    const tiers = parseCommissionTiers([
      { minRevenue: 50000, pct: 40 },
      { minRevenue: 80000, pct: 45 },
    ]);
    const low = calcStaffCommission({
      serviceRevenue: 40000,
      productRevenue: 0,
      servicePct: 35,
      productPct: 10,
      tiers,
    });
    assert.equal(low.servicePct, 35);
    const mid = calcStaffCommission({
      serviceRevenue: 50000,
      productRevenue: 0,
      servicePct: 35,
      productPct: 10,
      tiers,
    });
    assert.equal(mid.servicePct, 40);
    const high = calcStaffCommission({
      serviceRevenue: 90000,
      productRevenue: 0,
      servicePct: 35,
      productPct: 10,
      tiers,
    });
    assert.equal(high.servicePct, 45);
  });
});
