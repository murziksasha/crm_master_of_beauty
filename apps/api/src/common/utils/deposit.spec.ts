import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function calcDeposit(total: number, percent: number) {
  return Math.round(((total * percent) / 100) * 100) / 100;
}

function canCancelClient(hoursUntilVisit: number, minHours = 3) {
  return hoursUntilVisit >= minHours;
}

describe('deposit calc', () => {
  it('rounds to kopiyky', () => {
    assert.equal(calcDeposit(1000, 30), 300);
    assert.equal(calcDeposit(999, 30), 299.7);
  });
});

describe('portal cancel policy', () => {
  it('allows cancel when enough time left', () => {
    assert.equal(canCancelClient(5), true);
    assert.equal(canCancelClient(3), true);
    assert.equal(canCancelClient(2.9), false);
  });
});

describe('deposit credit on cash', () => {
  it('reduces payable by paid deposit', () => {
    const subtotal = 1000;
    const discount = 50;
    const loyalty = 0;
    const deposit = 300;
    const total = Math.max(0, subtotal - discount - loyalty - deposit);
    assert.equal(total, 650);
  });
});

describe('auto refund policy', () => {
  function shouldAutoRefund(status: string, depositPaid: boolean, env = 'true') {
    return env !== 'false' && status === 'CANCELLED' && depositPaid;
  }
  it('refunds only on CANCELLED with paid deposit', () => {
    assert.equal(shouldAutoRefund('CANCELLED', true), true);
    assert.equal(shouldAutoRefund('NO_SHOW', true), false);
    assert.equal(shouldAutoRefund('CANCELLED', false), false);
    assert.equal(shouldAutoRefund('CANCELLED', true, 'false'), false);
  });
});
