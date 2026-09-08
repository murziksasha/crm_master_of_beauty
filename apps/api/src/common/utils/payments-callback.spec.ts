import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OnlinePaymentStatus } from '@prisma/client';
import {
  amountsMatch,
  decideLiqPayCallback,
  isMockDepositAllowed,
} from './liqpay-callback';

describe('LiqPay amount verification', () => {
  it('rejects amount tampering', () => {
    const decision = decideLiqPayCallback({
      payload: { order_id: 'MOB-1', status: 'success', amount: 1, currency: 'UAH' },
      payment: { amount: 2000, currency: 'UAH', status: OnlinePaymentStatus.PENDING },
      sandboxAllowed: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, 'Amount mismatch');
  });

  it('accepts matching amounts within 1 kopiyka', () => {
    assert.equal(amountsMatch(2000, 2000), true);
    assert.equal(amountsMatch('2000.00', 2000), true);
    assert.equal(amountsMatch(1999.995, 2000), true);
    assert.equal(amountsMatch(1, 2000), false);
  });

  it('rejects currency mismatch', () => {
    const decision = decideLiqPayCallback({
      payload: { order_id: 'MOB-1', status: 'success', amount: 2000, currency: 'USD' },
      payment: { amount: 2000, currency: 'UAH', status: OnlinePaymentStatus.PENDING },
      sandboxAllowed: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, 'Currency mismatch');
  });

  it('does not treat wait_accept as success', () => {
    const decision = decideLiqPayCallback({
      payload: { order_id: 'MOB-1', status: 'wait_accept', amount: 2000, currency: 'UAH' },
      payment: { amount: 2000, currency: 'UAH', status: OnlinePaymentStatus.PENDING },
      sandboxAllowed: true,
    });
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.idempotent, false);
      assert.equal(decision.status, OnlinePaymentStatus.PENDING);
    }
  });

  it('replays SUCCESS without re-processing', () => {
    const decision = decideLiqPayCallback({
      payload: { order_id: 'MOB-1', status: 'success', amount: 1, currency: 'USD' },
      payment: { amount: 2000, currency: 'UAH', status: OnlinePaymentStatus.SUCCESS },
      sandboxAllowed: false,
    });
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.idempotent, true);
      assert.equal(decision.status, OnlinePaymentStatus.SUCCESS);
    }
  });

  it('accepts sandbox only when explicitly allowed', () => {
    const allowed = decideLiqPayCallback({
      payload: { order_id: 'MOB-1', status: 'sandbox', amount: 100, currency: 'UAH' },
      payment: { amount: 100, currency: 'UAH', status: OnlinePaymentStatus.PENDING },
      sandboxAllowed: true,
    });
    assert.equal(allowed.ok, true);
    if (allowed.ok) assert.equal(allowed.status, OnlinePaymentStatus.SUCCESS);

    const denied = decideLiqPayCallback({
      payload: { order_id: 'MOB-1', status: 'sandbox', amount: 100, currency: 'UAH' },
      payment: { amount: 100, currency: 'UAH', status: OnlinePaymentStatus.PENDING },
      sandboxAllowed: false,
    });
    assert.equal(denied.ok, true);
    if (denied.ok) assert.equal(denied.status, OnlinePaymentStatus.PENDING);
  });
});

describe('mock deposit guard', () => {
  it('never allows mock in production even with sandbox keys', () => {
    assert.equal(
      isMockDepositAllowed({
        NODE_ENV: 'production',
        LIQPAY_SANDBOX: 'true',
        DEPOSIT_MOCK: 'true',
      }),
      false,
    );
  });

  it('allows mock only in test or explicit non-prod DEPOSIT_MOCK', () => {
    assert.equal(isMockDepositAllowed({ NODE_ENV: 'test' }), true);
    assert.equal(
      isMockDepositAllowed({ NODE_ENV: 'development', DEPOSIT_MOCK: 'true' }),
      true,
    );
    assert.equal(
      isMockDepositAllowed({ NODE_ENV: 'development', LIQPAY_SANDBOX: 'true' }),
      false,
    );
  });
});
