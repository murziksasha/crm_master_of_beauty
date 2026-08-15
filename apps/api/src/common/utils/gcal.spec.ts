import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function gcalDates(start: Date, end: Date) {
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  return `${fmt(start)}/${fmt(end)}`;
}

describe('google calendar date format', () => {
  it('produces compact UTC range', () => {
    const start = new Date('2026-08-15T10:00:00.000Z');
    const end = new Date('2026-08-15T11:00:00.000Z');
    const s = gcalDates(start, end);
    assert.match(s, /^20260815T100000Z\/20260815T110000Z$/);
  });
});
