import { describe, expect, it } from 'vitest';

import {
  continuationDelayMs,
  followUpDue,
  needsOwner,
  QUIET_INTERVAL_MS,
  STALE_AFTER_MS,
  syncDue,
  worstOutcome,
  type SyncAttempt,
} from './auto';
import { ACCOUNT_OUTCOMES, NOT_SHOWN, type AccountOutcome, type AccountResult } from './coordinator';

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

  it('Scenario: A run that yields in the background starts nothing in the app', () => {
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

describe('a рахунок the token no longer shows is set aside', () => {
  const gone = (id: string): AccountResult => ({ ...result('unavailable', id), reason: NOT_SHOWN });

  it('Scenario: A vanished card does not make a working прогін unavailable', () => {
    expect(
      worstOutcome([result('complete', 'black'), gone('closed'), result('postponed', 'white')]),
    ).toBe('postponed');
    expect(worstOutcome([result('complete', 'black'), gone('closed')])).toBe('complete');
  });

  it('Scenario: A token that shows nothing linked is still a failure', () => {
    expect(worstOutcome([gone('a'), gone('b'), gone('c')])).toBe('unavailable');
  });

  it('an unavailable рахунок the bank did answer about still counts', () => {
    expect(worstOutcome([result('complete', 'black'), result('unavailable', 'white'), gone('closed')])).toBe(
      'unavailable',
    );
  });
});

describe('a поштовх makes a background chance due', () => {
  it('Scenario: A поштовх is due inside the тихий інтервал', () => {
    expect(
      syncDue({ links: 1, attemptedAtMs: NOW - 3 * MINUTE, outcome: 'complete', nudgedAtMs: NOW - MINUTE, nowMs: NOW }),
    ).toBe(true);
  });

  it('a поштовх from before the last attempt was already answered by it', () => {
    expect(
      syncDue({ links: 1, attemptedAtMs: NOW - 3 * MINUTE, outcome: 'complete', nudgedAtMs: NOW - 4 * MINUTE, nowMs: NOW }),
    ).toBe(false);
  });

  it('a поштовх with nothing linked is nothing', () => {
    expect(syncDue({ links: 0, nudgedAtMs: NOW - MINUTE, nowMs: NOW })).toBe(false);
  });
});

describe('when a прогін asks for a дочитування', () => {
  const GAP = MINUTE;
  /** A link позачерговий since `owedSinceMs`, whose last turn was `lastAttemptedAtMs`. */
  const link = (id: string, owedSinceMs: number | null, lastAttemptedAtMs: number | null = null) => ({
    monobankAccountId: `mono-${id}`,
    owedSinceMs,
    lastAttemptedAtMs,
  });
  const delay = (input: {
    accounts: readonly AccountResult[];
    links: readonly ReturnType<typeof link>[];
    inForeground?: boolean;
    lastRequestAtMs?: number;
  }) =>
    continuationDelayMs({
      accounts: input.accounts,
      links: input.links,
      inForeground: input.inForeground ?? false,
      ...(input.lastRequestAtMs === undefined ? {} : { lastRequestAtMs: input.lastRequestAtMs }),
      nowMs: NOW,
      gapMs: GAP,
    });

  it('Scenario: «Оновити» finishes with the app closed — the first link of the chain', () => {
    // Two read, the owner left while the прогін waited for the third: seven позачергові, none
    // given a turn since the owner asked, are перенесено.
    const owedAt = NOW - 3 * MINUTE;
    const accounts = [
      result('complete', 'a'),
      result('complete', 'b'),
      ...['c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => result('postponed', id)),
    ];
    const links = [
      link('a', null, NOW - 2 * MINUTE),
      link('b', null, NOW - 20_000),
      ...['c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => link(id, owedAt, NOW - 5 * 60 * MINUTE)),
    ];

    // The last statement request went out 20 s ago, so the next may go in 40 s — plus a margin.
    expect(delay({ accounts, links, lastRequestAtMs: NOW - 20_000 })).toBe(40_000 + 2_000);
  });

  it('Scenario: A background chance that reads the one moved рахунок asks for nothing more', () => {
    expect(
      delay({
        accounts: [result('complete', 'black'), result('postponed', 'white'), result('postponed', 'jar')],
        links: [link('black', null, NOW), link('white', null, NOW - HOUR), link('jar', null, NOW - 2 * HOUR)],
        lastRequestAtMs: NOW,
      }),
    ).toBeUndefined();
  });

  it('Scenario: A failure does not start a chain', () => {
    expect(
      delay({
        accounts: [result('unavailable', 'black'), result('postponed', 'white')],
        links: [link('black', NOW - MINUTE, NOW), link('white', null, NOW - HOUR)],
        lastRequestAtMs: NOW,
      }),
    ).toBeUndefined();
  });

  it('Scenario: A рахунок already given its turn does not keep the chain going', () => {
    // It became позачерговий, had its turn in this прогін (one page of several), and was stopped:
    // still позачерговий, but no longer first — the chances continue it.
    expect(
      delay({
        accounts: [result('postponed', 'black')],
        links: [link('black', NOW - 5 * MINUTE, NOW - 10_000)],
        lastRequestAtMs: NOW - 10_000,
      }),
    ).toBeUndefined();
  });

  it('Scenario: Nothing is asked while the owner is watching', () => {
    expect(
      delay({
        accounts: [result('postponed', 'white')],
        links: [link('white', NOW - MINUTE)],
        inForeground: true,
        lastRequestAtMs: NOW - 10_000,
      }),
    ).toBeUndefined();
  });

  it('Scenario: A рахунок the busy ones keep passing over is reached within three hours', () => {
    // The black card moved before this chance and took its one statement request; the white card
    // has had no turn for three hours, so the chance asks for a дочитування that reads it.
    expect(
      delay({
        accounts: [result('complete', 'black'), result('postponed', 'white')],
        links: [link('black', null, NOW), link('white', null, NOW - 3 * HOUR)],
        lastRequestAtMs: NOW,
      }),
    ).toBe(GAP + 2_000);
    // Two hours in, it is merely waiting: the ordinary chances reach it.
    expect(
      delay({
        accounts: [result('complete', 'black'), result('postponed', 'white')],
        links: [link('black', null, NOW), link('white', null, NOW - 2 * HOUR)],
        lastRequestAtMs: NOW,
      }),
    ).toBeUndefined();
  });

  it('Scenario: A phone that gave no chance for hours catches up in minutes', () => {
    // Four hours without a chance: every рахунок is overdue; this one read the first.
    const turnedLongAgo = NOW - 4 * HOUR;
    const accounts = [result('complete', 'a'), ...['b', 'c', 'd'].map((id) => result('postponed', id))];
    const links = [link('a', null, NOW), ...['b', 'c', 'd'].map((id) => link(id, null, turnedLongAgo))];

    expect(delay({ accounts, links, lastRequestAtMs: NOW })).toBe(GAP + 2_000);
  });

  it('never sooner than five seconds, and a gap long past costs nothing but that', () => {
    const owed = { accounts: [result('postponed', 'white')], links: [link('white', NOW - MINUTE)] };
    expect(delay({ ...owed, lastRequestAtMs: NOW - HOUR })).toBe(5_000);
    expect(delay(owed)).toBe(5_000);
  });

  it('a request moment in the future of the clock waits one gap, never longer', () => {
    const owed = { accounts: [result('postponed', 'white')], links: [link('white', NOW - MINUTE)] };
    expect(delay({ ...owed, lastRequestAtMs: NOW + HOUR })).toBe(GAP + 2_000);
  });

  it('a postponed рахунок whose link is gone asks for nothing', () => {
    expect(delay({ accounts: [result('postponed', 'white')], links: [], lastRequestAtMs: NOW })).toBeUndefined();
  });
});
