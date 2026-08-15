import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function applyPackageBurn(
  items: { type: string; refId?: string; unitPrice: number }[],
  packageServiceId: string | null,
) {
  const next = items.map((i) => ({ ...i }));
  for (const item of next) {
    if (item.type !== 'SERVICE') continue;
    if (packageServiceId && item.refId && item.refId !== packageServiceId) continue;
    item.unitPrice = 0;
    break;
  }
  return next;
}

function applyPackageBurnN(
  items: { type: string; refId?: string; unitPrice: number }[],
  packageServiceId: string | null,
  sessions: number,
) {
  const next = items.map((i) => ({ ...i }));
  let left = sessions;
  for (const item of next) {
    if (left <= 0) break;
    if (item.type !== 'SERVICE') continue;
    if (packageServiceId && item.refId && item.refId !== packageServiceId) continue;
    item.unitPrice = 0;
    left -= 1;
  }
  return { items: next, burned: sessions - left };
}

describe('package session burn', () => {
  it('zeros first matching service', () => {
    const out = applyPackageBurn(
      [
        { type: 'SERVICE', refId: 'a', unitPrice: 500 },
        { type: 'SERVICE', refId: 'b', unitPrice: 300 },
      ],
      'a',
    );
    assert.equal(out[0].unitPrice, 0);
    assert.equal(out[1].unitPrice, 300);
  });

  it('zeros first service when no template service', () => {
    const out = applyPackageBurn(
      [
        { type: 'SERVICE', refId: 'a', unitPrice: 500 },
        { type: 'PRODUCT', unitPrice: 100 },
      ],
      null,
    );
    assert.equal(out[0].unitPrice, 0);
    assert.equal(out[1].unitPrice, 100);
  });

  it('burns N matching sessions', () => {
    const { items, burned } = applyPackageBurnN(
      [
        { type: 'SERVICE', refId: 'a', unitPrice: 500 },
        { type: 'SERVICE', refId: 'a', unitPrice: 500 },
        { type: 'SERVICE', refId: 'b', unitPrice: 300 },
      ],
      'a',
      2,
    );
    assert.equal(burned, 2);
    assert.equal(items[0].unitPrice, 0);
    assert.equal(items[1].unitPrice, 0);
    assert.equal(items[2].unitPrice, 300);
  });
});
