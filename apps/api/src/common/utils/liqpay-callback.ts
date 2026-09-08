import { OnlinePaymentStatus } from '@prisma/client';

export type LiqPayCallbackPayload = {
  order_id?: string;
  status?: string;
  payment_id?: string | number;
  amount?: number | string;
  currency?: string;
};

export type LiqPayDecision =
  | { ok: true; idempotent: true; status: OnlinePaymentStatus }
  | {
      ok: true;
      idempotent: false;
      status: OnlinePaymentStatus;
    }
  | { ok: false; reason: string; http: 400 };

const AMOUNT_EPS = 0.01;

export function amountsMatch(
  payloadAmount: number | string | undefined,
  expectedAmount: number | string,
  eps = AMOUNT_EPS,
) {
  const a = Number(payloadAmount);
  const b = Number(expectedAmount);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < eps;
}

export function isAllowedLiqPaySuccessStatus(
  status: string | undefined,
  sandboxAllowed: boolean,
) {
  if (status === 'success') return true;
  if (sandboxAllowed && status === 'sandbox') return true;
  return false;
}

export function mapLiqPayStatus(
  payloadStatus: string | undefined,
  sandboxAllowed: boolean,
): OnlinePaymentStatus {
  if (isAllowedLiqPaySuccessStatus(payloadStatus, sandboxAllowed)) {
    return OnlinePaymentStatus.SUCCESS;
  }
  if (payloadStatus === 'failure' || payloadStatus === 'error') {
    return OnlinePaymentStatus.FAILURE;
  }
  return OnlinePaymentStatus.PENDING;
}

/**
 * Validate a signed LiqPay callback against the stored payment.
 * Does not perform crypto — caller verifies signature first.
 */
export function decideLiqPayCallback(params: {
  payload: LiqPayCallbackPayload;
  payment: {
    amount: number | string;
    currency: string;
    status: OnlinePaymentStatus | string;
  };
  sandboxAllowed: boolean;
}): LiqPayDecision {
  const { payload, payment, sandboxAllowed } = params;
  if (!payload.order_id) {
    return { ok: false, reason: 'Missing order_id', http: 400 };
  }
  if (payment.status === OnlinePaymentStatus.SUCCESS) {
    return { ok: true, idempotent: true, status: OnlinePaymentStatus.SUCCESS };
  }

  const currency = (payload.currency || 'UAH').toUpperCase();
  const expectedCurrency = (payment.currency || 'UAH').toUpperCase();
  if (currency !== expectedCurrency) {
    return { ok: false, reason: 'Currency mismatch', http: 400 };
  }
  if (!amountsMatch(payload.amount, payment.amount)) {
    return { ok: false, reason: 'Amount mismatch', http: 400 };
  }

  const status = mapLiqPayStatus(payload.status, sandboxAllowed);
  return { ok: true, idempotent: false, status };
}

export function isMockDepositAllowed(env: {
  NODE_ENV?: string;
  DEPOSIT_MOCK?: string;
  LIQPAY_SANDBOX?: string;
}) {
  // Never allow mock deposits in production, even if sandbox keys are active.
  if (env.NODE_ENV === 'production') return false;
  // Automated tests
  if (env.NODE_ENV === 'test') return true;
  // Explicit local/dev opt-in only
  return env.DEPOSIT_MOCK === 'true';
}
