import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bomRestoreLines,
  giftBalanceAfterRefund,
  packageSessionsAfterRefund,
} from './refund-rollback';

describe('storno materials / packages / gift', () => {
  it('restores BOM stock for service recipes', () => {
    const lines = bomRestoreLines(
      [
        { type: 'SERVICE', refId: 'svc-color', name: 'Фарбування', qty: 1 },
        { type: 'PRODUCT', refId: 'prod-shampoo', name: 'Шампунь', qty: 2 },
      ],
      [
        { serviceId: 'svc-color', productId: 'dye', productName: 'Фарба', qty: 60 },
        { serviceId: 'svc-color', productId: 'ox', productName: 'Оксид', qty: 90 },
      ],
    );
    assert.equal(lines.length, 2);
    assert.equal(lines.find((l) => l.productId === 'dye')?.qty, 60);
    assert.equal(lines.find((l) => l.productId === 'ox')?.qty, 90);
  });

  it('scales BOM by service qty', () => {
    const lines = bomRestoreLines(
      [{ type: 'SERVICE', refId: 'manicure', name: 'Манікюр', qty: 2 }],
      [{ serviceId: 'manicure', productId: 'base', productName: 'База', qty: 3 }],
    );
    assert.equal(lines[0].qty, 6);
  });

  it('returns package sessions on refund', () => {
    const next = packageSessionsAfterRefund(2, 10, 1);
    assert.equal(next.sessionsLeft, 3);
    assert.equal(next.status, 'ACTIVE');
    const exhausted = packageSessionsAfterRefund(0, 1, 0);
    assert.equal(exhausted.status, 'EXHAUSTED');
  });

  it('reinstates gift certificate balance', () => {
    const next = giftBalanceAfterRefund(200, 800, 1000);
    assert.equal(next.balance, 1000);
    assert.equal(next.isActive, true);
    const empty = giftBalanceAfterRefund(0, 0, 500);
    assert.equal(empty.isActive, false);
  });
});
