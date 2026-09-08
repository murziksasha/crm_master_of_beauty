export const OTP_MAX_ATTEMPTS = 5;
export const OTP_REQUEST_WINDOW_SEC = 15 * 60;
export const OTP_REQUEST_MAX = 3;
export const OTP_TTL_MS = 10 * 60 * 1000;

export function otpRequestKey(phone: string) {
  return `otp:req:${phone.replace(/[^\d+]/g, '')}`;
}

export function shouldLockOtp(attempts: number, max = OTP_MAX_ATTEMPTS) {
  return attempts >= max;
}

export function nextOtpAttempts(current: number) {
  return current + 1;
}

/** Dev codes are only returned during automated tests — never in staging/prod. */
export function portalDevCodeAllowed(env: {
  NODE_ENV?: string;
  PORTAL_DEV_CODE?: string;
}) {
  return env.NODE_ENV === 'test';
}

export function isOtpRateLimited(count: number, max = OTP_REQUEST_MAX) {
  return count > max;
}
