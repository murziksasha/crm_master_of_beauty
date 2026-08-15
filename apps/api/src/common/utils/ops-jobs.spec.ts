import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function daysUntilBirthday(today: Date, birth: Date) {
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (next < start) next.setFullYear(next.getFullYear() + 1);
  return Math.round((next.getTime() - start.getTime()) / 86_400_000);
}

describe('birthday window', () => {
  it('counts days until next birthday', () => {
    const today = new Date(2026, 7, 15); // Aug 15
    const b = new Date(1990, 7, 15);
    assert.equal(daysUntilBirthday(today, b), 0);
    const b2 = new Date(1990, 7, 18);
    assert.equal(daysUntilBirthday(today, b2), 3);
  });
});

describe('low stock filter', () => {
  it('flags qty <= min', () => {
    const products = [
      { stockQty: 2, minStock: 5 },
      { stockQty: 10, minStock: 5 },
      { stockQty: 5, minStock: 5 },
    ];
    const low = products.filter((p) => p.stockQty <= p.minStock);
    assert.equal(low.length, 2);
  });
});
