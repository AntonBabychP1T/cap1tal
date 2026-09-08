import { describe, expect, it } from 'vitest';

import {
  followUpDue,
  needsOwner,
  QUIET_INTERVAL_MS,
  STALE_AFTER_MS,
  syncDue,
  worstOutcome,
  type SyncAttempt,
} from './auto';
import { ACCOUNT_OUTCOMES, type AccountOutcome, type AccountResult } from './coordinator';

/**
 * The four decisions behind «відкрив застосунок → тихо запустився sync», with no clock, no
 * storage and no network anywhere near them. Every moment below is a number this file chose.
 */

const NOW = Date.UTC(2026, 8, 2, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function result(outcome: AccountOutcome, id: string = outcome): AccountResult {
  return { monobankAccountId: `mono-${id}`, accountId: id, outcome, imported: 0 };
}

describe('when a sync may start on its own', () => {
  it('Scenario: The first opening on a linked device syncs', () => {
    expect(syncDue({ links: 1, nowMs: NOW })).toBe(true);
  });

  it('Scenario: Reopening inside the interval sends nothing', () => {
    expect(syncDue({ links: 1, attemptedAtMs: NOW - 2 * MINUTE, nowMs: NOW })).toBe(false);
  });

  it('Scenario: Returning after hours syncs', () => {
    expect(syncDue({ links: 1, attemptedAtMs: NOW - 3 * HOUR, nowMs: NOW })).toBe(true);
  });

  it('Scenario: With nothing linked nothing is attempted', () => {
    // No link, no statement to fetch — however long ago the last attempt was, and even if there
    // has never been one.
    expect(syncDue({ links: 0, nowMs: NOW })).toBe(false);
    expect(syncDue({ links: 0, attemptedAtMs: NOW - 3 * HOUR, nowMs: NOW })).toBe(false);
  });

  it('the interval is exactly the quiet interval, and its edge is due', () => {
    const attemptedAtMs = NOW - QUIET_INTERVAL_MS;
    expect(syncDue({ links: 1, attemptedAtMs, nowMs: NOW })).toBe(true);
    expect(syncDue({ links: 1, attemptedAtMs: attemptedAtMs + 1, nowMs: NOW })).toBe(false);
  });

  it('Scenario: Opening after a postponed run syncs at once', () => {
    // Inside the quiet interval, and due anyway: that run stopped for want of time or of
    // foreground, not for want of need, and the requests it did not spend are still owed.
    expect(
      syncDue({ links: 1, attemptedAtMs: NOW - 2 * MINUTE, outcome: 'postponed', nowMs: NOW }),
    ).toBe(true);
  });

  it('Scenario: A completed run still holds the interval', () => {
    expect(
      syncDue({ links: 1, attemptedAtMs: NOW - 2 * MINUTE, outcome: 'complete', nowMs: NOW }),
    ).toBe(false);
  });

  it('only postponed shortens the interval, and nothing shortens it without a link', () => {
    for (const outcome of ['cancelled', 'unavailable', 'rate-limited', 'invalid-token', 'хтозна']) {
      expect(
        syncDue({ links: 1, attemptedAtMs: NOW - 2 * MINUTE, outcome, nowMs: NOW }),
      ).toBe(false);
    }
    expect(
      syncDue({ links: 0, attemptedAtMs: NOW - 2 * MINUTE, outcome: 'postponed', nowMs: NOW }),
    ).toBe(false);
  });

  it('an attempt dated in the future is due, not never due', () => {
    // An NTP correction or a clock set by hand can leave an attempt ahead of now. Waiting it out
    // would disable automatic sync until the phone caught up — for a year-ahead clock, forever —
    // so it runs, and that run's own `beginAttempt` heals the moment.
    expect(syncDue({ links: 1, attemptedAtMs: NOW + HOUR, nowMs: NOW })).toBe(true);
    // Still nothing to sync without a link, whatever the clock says.
    expect(syncDue({ links: 0, attemptedAtMs: NOW + HOUR, nowMs: NOW })).toBe(false);
  });
});

describe('what a finished run is remembered as', () => {
  it('Scenario: The worst outcome is the one remembered', () => {
    expect(worstOutcome([result('complete'), result('invalid-token')])).toBe('invalid-token');
  });

  it('Scenario: A rate limit outranks an unavailable account', () => {
    expect(worstOutcome([result('unavailable'), result('rate-limited')])).toBe('rate-limited');
  });

  it('Scenario: A stopped account outranks a completed one', () => {
    expect(worstOutcome([result('complete'), result('cancelled')])).toBe('cancelled');
  });

  it('Scenario: A postponed рахунок outranks a completed one', () => {
    expect(
      worstOutcome([result('complete', 'a'), result('postponed', 'b'), result('postponed', 'c')]),
    ).toBe('postponed');
  });

  it('Scenario: A failure outranks a postponed рахунок', () => {
    expect(
      worstOutcome([result('unavailable'), result('postponed', 'b'), result('postponed', 'c')]),
    ).toBe('unavailable');
  });

  it('Scenario: A cancelled рахунок outranks a postponed one', () => {
    // Both mean the run stopped and neither needs the owner, so when one run holds both, the
    // owner's own decision is the more informative word.
    expect(worstOutcome([result('cancelled'), result('postponed')])).toBe('cancelled');
  });

  it('Scenario: A whole run that worked is remembered as complete', () => {
    expect(worstOutcome([result('complete', 'a'), result('complete', 'b')])).toBe('complete');
  });

  it('is total over every outcome an account can end with', () => {
    // The ordering has to cover the coordinator's whole union, or a run would finish with no
    // outcome to remember. Read from `ACCOUNT_OUTCOMES` rather than listed here, so a seventh
    // outcome fails this test instead of quietly falling through the order.
    expect(ACCOUNT_OUTCOMES).toHaveLength(6);
    for (const outcome of ACCOUNT_OUTCOMES) {
      expect(worstOutcome([result(outcome)])).toBe(outcome);
    }
  });

  it('a run with no accounts is remembered as nothing rather than as success', () => {
    expect(worstOutcome([])).toBeUndefined();
  });
});

describe('whether monobank needs the owner', () => {
  const attempt = (outcome?: string, agoMs = MINUTE): SyncAttempt => ({
    attemptedAtMs: NOW - agoMs,
    ...(outcome === undefined ? {} : { outcome }),
  });

  it('Scenario: A rejected token needs the owner at once', () => {
    expect(
      needsOwner({
        attempt: attempt('invalid-token'),
        lastCompletedAtMs: NOW - 10 * MINUTE,
        nowMs: NOW,
      }),
    ).toBe('token-rejected');
  });

  it('Scenario: A single unreachable attempt over fresh data needs nobody', () => {
    expect(
      needsOwner({ attempt: attempt('unavailable'), lastCompletedAtMs: NOW - 2 * HOUR, nowMs: NOW }),
    ).toBeUndefined();
  });

  it('Scenario: Failing over stale data needs the owner', () => {
    expect(
      needsOwner({
        attempt: attempt('unavailable'),
        lastCompletedAtMs: NOW - 30 * HOUR,
        nowMs: NOW,
      }),
    ).toBe('not-refreshed');
  });

  it('a rate limit over stale data needs the owner too', () => {
    expect(
      needsOwner({
        attempt: attempt('rate-limited'),
        lastCompletedAtMs: NOW - 30 * HOUR,
        nowMs: NOW,
      }),
    ).toBe('not-refreshed');
  });

  it('a linked рахунок that has never completed a sync counts as stale', () => {
    // Just connected and the first run failed: there is no moment to measure from, and «the data
    // has not been refreshed» is exactly true — it never has been.
    expect(needsOwner({ attempt: attempt('unavailable'), nowMs: NOW })).toBe('not-refreshed');
  });

  it('Scenario: A run the owner stopped is not a failure', () => {
    expect(
      needsOwner({ attempt: attempt('cancelled'), lastCompletedAtMs: NOW - 30 * HOUR, nowMs: NOW }),
    ).toBeUndefined();
  });

  it('Scenario: A postponed attempt needs nobody', () => {
    // However old the data is: the run stopped for want of time, not because the bank or the
    // token failed, and the next run continues it.
    expect(
      needsOwner({ attempt: attempt('postponed'), lastCompletedAtMs: NOW - 30 * HOUR, nowMs: NOW }),
    ).toBeUndefined();
    expect(needsOwner({ attempt: attempt('postponed'), nowMs: NOW })).toBeUndefined();
  });

  it('Scenario: A run that worked needs nobody', () => {
    expect(needsOwner({ attempt: attempt('complete'), nowMs: NOW })).toBeUndefined();
  });

  it('Scenario: A device that has tried nothing yet needs nobody', () => {
    expect(needsOwner({ attempt: undefined, nowMs: NOW })).toBeUndefined();
  });

  it('Scenario: An attempt with no outcome needs nobody', () => {
    expect(
      needsOwner({ attempt: attempt(undefined), lastCompletedAtMs: NOW - 30 * HOUR, nowMs: NOW }),
    ).toBeUndefined();
  });

  it('an outcome this build does not know reads as nothing reported', () => {
    // A бекап is not the road it could arrive by — the attempt never travels in one — but a
    // downgrade after a later build wrote a new outcome is. Silence is the safe answer.
    expect(
      needsOwner({ attempt: attempt('exploded'), lastCompletedAtMs: NOW - 30 * HOUR, nowMs: NOW }),
    ).toBeUndefined();
  });

  it('the day is the threshold, and a day exactly is not yet stale', () => {
    const failing = attempt('unavailable');
    expect(
      needsOwner({ attempt: failing, lastCompletedAtMs: NOW - STALE_AFTER_MS, nowMs: NOW }),
    ).toBeUndefined();
    expect(
      needsOwner({ attempt: failing, lastCompletedAtMs: NOW - STALE_AFTER_MS - 1, nowMs: NOW }),
    ).toBe('not-refreshed');
  });
});

describe('whether a run that ended has to be finished at once', () => {
  const attempt = (outcome?: string): SyncAttempt => ({
    attemptedAtMs: NOW - MINUTE,
    ...(outcome === undefined ? {} : { outcome }),
  });

  it('Scenario: A run the background began finishes in front of the owner', () => {
    expect(followUpDue({ attempt: attempt('postponed'), inForeground: true })).toBe(true);
  });

  it('Scenario: The follow-up is not a loop', () => {
    // The follow-up runs without a budget in front of the owner, so it ends complete — and a
    // completed run is followed by nothing.
    expect(followUpDue({ attempt: attempt('complete'), inForeground: true })).toBe(false);
  });

  it('Scenario: A run that never reached the bank is not followed up', () => {
    // Links and no token: the run withdrew its attempt, so there is nothing to decide from and
    // nothing starts. Asking `syncDue` here instead would answer true forever.
    expect(followUpDue({ attempt: undefined, inForeground: true })).toBe(false);
  });

  it('Scenario: A run that yields in the background is not followed up', () => {
    expect(followUpDue({ attempt: attempt('postponed'), inForeground: false })).toBe(false);
  });

  it('nothing but a postponed attempt is followed up', () => {
    for (const outcome of ['cancelled', 'unavailable', 'rate-limited', 'invalid-token', 'хтозна']) {
      expect(followUpDue({ attempt: attempt(outcome), inForeground: true })).toBe(false);
    }
    // An attempt whose run has not reported yet — one going on now, or one the phone did not
    // survive — is not a postponed one either.
    expect(followUpDue({ attempt: attempt(), inForeground: true })).toBe(false);
  });
});
