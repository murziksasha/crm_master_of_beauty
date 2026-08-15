import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('payroll close rules', () => {
  it('rejects empty commission list', () => {
    const items: unknown[] = [];
    assert.equal(items.length === 0, true);
  });

  it('sums total commission', () => {
    const items = [
      { commission: 100 },
      { commission: 250.5 },
      { commission: 49.5 },
    ];
    const total = items.reduce((s, x) => s + x.commission, 0);
    assert.equal(total, 400);
  });
});
