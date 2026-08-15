import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function buildIcs(uid: string, start: Date, end: Date, title: string) {
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${title}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

describe('ics attachment', () => {
  it('contains VEVENT and UID', () => {
    const ics = buildIcs(
      'abc@test',
      new Date('2026-08-15T10:00:00.000Z'),
      new Date('2026-08-15T11:00:00.000Z'),
      'Test',
    );
    assert.match(ics, /BEGIN:VEVENT/);
    assert.match(ics, /UID:abc@test/);
    assert.match(ics, /SUMMARY:Test/);
  });
});
