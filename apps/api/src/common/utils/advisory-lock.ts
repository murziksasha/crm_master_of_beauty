/** Stable keys for pg_advisory_xact_lock(hashtext(...)). */
export function staffLockKey(staffId: string) {
  return staffId;
}

export function roomLockKey(roomId: string) {
  return `room_${roomId}`;
}
