import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function snapToStep(minutesFromStart: number, step = 15, maxMin = 13 * 60) {
  const snapped = Math.round(minutesFromStart / step) * step;
  return Math.max(0, Math.min(maxMin - step, snapped));
}

describe('calendar snap', () => {
  it('snaps to 15 min grid', () => {
    assert.equal(snapToStep(7), 0);
    assert.equal(snapToStep(8), 15);
    assert.equal(snapToStep(22), 15);
    assert.equal(snapToStep(23), 30);
  });

  it('clamps to day bounds', () => {
    assert.equal(snapToStep(-10), 0);
    assert.equal(snapToStep(9999, 15, 780), 765);
  });
});
