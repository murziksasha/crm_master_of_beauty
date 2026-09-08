import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roomLockKey, staffLockKey } from './advisory-lock';

describe('room advisory lock key', () => {
  it('namespaces room locks separately from staff', () => {
    const staffId = 'clxyzstaff';
    const roomId = 'clxyzroom';
    assert.equal(staffLockKey(staffId), staffId);
    assert.equal(roomLockKey(roomId), `room_${roomId}`);
    assert.notEqual(roomLockKey(staffId), staffLockKey(staffId));
  });

  it('is stable for the same room across concurrent bookers', () => {
    assert.equal(roomLockKey('booth-1'), roomLockKey('booth-1'));
  });
});
