import { describe, expect, it } from 'vitest';

import { BACKUP_INTERVAL_MS, isBackupDue, shouldUpload } from './schedule';

/**
 * The schedule, with `now` injected — no fake timers, no clock, no device. That is what design D9
 * bought by making "is a backup due" a pure function the background task merely asks.
 */

const yesterday = new Date('2026-09-06T08:00:00.000Z');
const today = new Date('2026-09-07T08:00:00.000Z');

describe('whether a бекап is due', () => {
  it('Scenario: A due backup runs in the background', () => {
    // Connected, more than 24 hours since the last success, and the system gave the app a turn.
    expect(isBackupDue({ connected: true, lastSuccessAt: yesterday, now: today })).toBe(true);
    // Exactly 24 hours is due: "at least once every 24 hours" is not "after more than".
    expect(
      isBackupDue({
        connected: true,
        lastSuccessAt: yesterday,
        now: new Date(yesterday.getTime() + BACKUP_INTERVAL_MS),
      }),
    ).toBe(true);
    // A minute short is not.
    expect(
      isBackupDue({
        connected: true,
        lastSuccessAt: yesterday,
        now: new Date(yesterday.getTime() + BACKUP_INTERVAL_MS - 60_000),
      }),
    ).toBe(false);
  });

  it('Scenario: A missed window is caught up on opening', () => {
    // The system never gave the app a turn for three days. Opening the app asks the same function,
    // which is the whole reason the catch-up and the daily run cannot drift apart.
    const threeDaysLater = new Date(yesterday.getTime() + 3 * BACKUP_INTERVAL_MS);

    expect(isBackupDue({ connected: true, lastSuccessAt: yesterday, now: threeDaysLater })).toBe(
      true,
    );
  });

  it('Scenario: A disconnected app never uploads', () => {
    // Not connected, and a year has passed: still nothing. The spec's "nothing leaves the phone
    // before connecting" is decided here rather than at every call site.
    expect(isBackupDue({ connected: false, lastSuccessAt: yesterday, now: today })).toBe(false);
    expect(isBackupDue({ connected: false, now: today })).toBe(false);
  });

  it('A phone that has never uploaded is due at once', () => {
    // The first бекап is the one whose absence costs the most. Waiting a day after connecting
    // would leave the owner unprotected through exactly the window they just asked about.
    expect(isBackupDue({ connected: true, now: today })).toBe(true);
  });

  it('A clock that went backwards is due, not due-in-a-day', () => {
    // A device whose time was corrected: the last known good бекап is in the phone's own future.
    // Reading that as "not due for 24 hours" would silently skip a day; uploading costs a request.
    expect(isBackupDue({ connected: true, lastSuccessAt: today, now: yesterday })).toBe(true);
  });

  it('states no clock time — the interval is a duration, not an hour', () => {
    // The spec forbids claiming a time Android does not guarantee. The schedule knows a length of
    // time and nothing about hours of the day, so there is no time it could claim.
    expect(BACKUP_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('whether a due бекап is worth sending', () => {
  it('Scenario: An unchanged бекап is not uploaded again', () => {
    // Sameness is the бекап's own integrity value over its contents. Two бекапи of an unchanged
    // phone are never byte-for-byte equal — each records the moment it was made — so the checksum
    // is the only sameness a бекап can have.
    expect(shouldUpload({ checksum: 'deadbeef', lastUploadedChecksum: 'deadbeef' })).toBe(false);
  });

  it('A changed бекап is sent', () => {
    expect(shouldUpload({ checksum: 'cafebabe', lastUploadedChecksum: 'deadbeef' })).toBe(true);
  });

  it('A phone that has uploaded nothing sends whatever it has', () => {
    expect(shouldUpload({ checksum: 'deadbeef' })).toBe(true);
  });
});
