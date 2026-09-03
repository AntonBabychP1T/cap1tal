import { describe, expect, it } from 'vitest';

import {
  needsOwner,
  QUIET_INTERVAL_MS,
  STALE_AFTER_MS,
  syncDue,
  worstOutcome,
  type SyncAttempt,
} from './auto';
import type { AccountOutcome, AccountResult } from './coordinator';

/**
 * The three decisions behind «відкрив застосунок → тихо запустився sync», with no clock, no
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

  it('Scenario: A whole run that worked is remembered as complete', () => {
    expect(worstOutcome([result('complete', 'a'), result('complete', 'b')])).toBe('complete');
  });

  it('is total over every outcome an account can end with', () => {
    // The ordering has to cover the coordinator's whole union, or a run would finish with no
    // outcome to remember. Each one alone is itself.
    const every: readonly AccountOutcome[] = [
      'complete',
      'invalid-token',
      'rate-limited',
      'unavailable',
      'cancelled',
    ];
    for (const outcome of every) {
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
