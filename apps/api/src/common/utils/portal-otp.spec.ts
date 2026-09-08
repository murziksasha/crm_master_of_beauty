import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOtpRateLimited,
  nextOtpAttempts,
  OTP_MAX_ATTEMPTS,
  OTP_REQUEST_MAX,
  portalDevCodeAllowed,
  shouldLockOtp,
} from './otp-policy';

describe('portal OTP lockout', () => {
  it('locks after 5 failed attempts', () => {
    let attempts = 0;
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      attempts = nextOtpAttempts(attempts);
    }
    assert.equal(attempts, 5);
    assert.equal(shouldLockOtp(attempts), true);
    assert.equal(shouldLockOtp(4), false);
  });

  it('rate-limits OTP requests after 3 per window', () => {
    assert.equal(isOtpRateLimited(3), false);
    assert.equal(isOtpRateLimited(4), true);
    assert.equal(isOtpRateLimited(OTP_REQUEST_MAX + 1), true);
  });

  it('strips devCode outside automated tests', () => {
    assert.equal(portalDevCodeAllowed({ NODE_ENV: 'test' }), true);
    assert.equal(portalDevCodeAllowed({ NODE_ENV: 'development', PORTAL_DEV_CODE: 'true' }), false);
    assert.equal(portalDevCodeAllowed({ NODE_ENV: 'production', PORTAL_DEV_CODE: 'true' }), false);
  });
});
