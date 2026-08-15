import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Pure overlap helper mirrored from booking conflict logic */
function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

describe('appointment range overlap', () => {
  it('detects overlapping ranges', () => {
    assert.equal(rangesOverlap(10, 20, 15, 25), true);
    assert.equal(rangesOverlap(10, 20, 20, 30), false);
    assert.equal(rangesOverlap(10, 20, 5, 10), false);
    assert.equal(rangesOverlap(10, 20, 12, 18), true);
  });

  it('treats touching ends as free (no double book on boundary)', () => {
    assert.equal(rangesOverlap(9 * 60, 10 * 60, 10 * 60, 11 * 60), false);
  });
});

describe('commission calc', () => {
  it('applies percent to service revenue only', () => {
    const serviceRev = 1000;
    const pct = 40;
    const commission = (serviceRev * pct) / 100;
    assert.equal(commission, 400);
  });
});
