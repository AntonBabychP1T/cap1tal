import { describe, expect, it } from 'vitest';

import { decideAlert, decideClear } from './alerts';
import { ALERT_NOTICES, type AlertKind } from './notices';

/** The kinds outstanding after a run of decisions — what `src/ui/alerting.ts` keeps in storage. */
function raiseAll(
  kinds: readonly { readonly kind: AlertKind; readonly attended: boolean }[],
): { readonly outstanding: AlertKind[]; readonly posted: string[] } {
  const outstanding: AlertKind[] = [];
  const posted: string[] = [];
  for (const each of kinds) {
    const decision = decideAlert({ kind: each.kind, outstanding, attended: each.attended });
    if (typeof decision !== 'string') {
      posted.push(decision.post.id);
      outstanding.push(each.kind);
    }
  }
  return { outstanding, posted };
}

describe('raising a сповіщення про збій', () => {
  it('posts the notice of the action that failed', () => {
    const decision = decideAlert({ kind: 'collection', outstanding: [], attended: false });
    expect(decision).toEqual({ post: ALERT_NOTICES.collection });
  });

  it('Scenario: The same failure three times is one сповіщення', () => {
    const run = raiseAll([
      { kind: 'collection', attended: false },
      { kind: 'collection', attended: false },
      { kind: 'collection', attended: false },
    ]);
    expect(run.posted).toEqual(['alert:collection']);
    expect(run.outstanding).toEqual(['collection']);
    // And it says which of the two silences it is, so the caller need not guess.
    expect(decideAlert({ kind: 'collection', outstanding: ['collection'], attended: false })).toBe(
      'already-outstanding',
    );
  });

  it('Scenario: A failure the owner is looking at raises nothing', () => {
    expect(decideAlert({ kind: 'backup', outstanding: [], attended: true })).toBe('attended');
  });

  it('leaves an attended failure with nothing outstanding to clear later', () => {
    // Not merely un-posted: nothing is remembered either, so opening «Бекап» afterwards has
    // nothing to clear and the next failure while the owner is away announces itself normally.
    const run = raiseAll([
      { kind: 'backup', attended: true },
      { kind: 'backup', attended: false },
    ]);
    expect(run.outstanding).toEqual(['backup']);
    expect(run.posted).toEqual(['alert:backup']);
  });

  it('says nothing twice even when the owner is looking at an already outstanding one', () => {
    expect(decideAlert({ kind: 'backup', outstanding: ['backup'], attended: true })).toBe(
      'attended',
    );
  });

  it('Scenario: Two different failures stand side by side', () => {
    const run = raiseAll([
      { kind: 'collection', attended: false },
      { kind: 'monobank-sync', attended: false },
    ]);
    expect(run.posted).toEqual(['alert:collection', 'alert:monobank-sync']);
    expect(run.outstanding).toEqual(['collection', 'monobank-sync']);
    // Neither silences the other: each is asked about its own kind only.
    expect(decideAlert({ kind: 'saldo-import', outstanding: run.outstanding, attended: false }))
      .toEqual({ post: ALERT_NOTICES['saldo-import'] });
  });

  it('reads the outstanding set as a Set as readily as a list', () => {
    expect(
      decideAlert({ kind: 'collection', outstanding: new Set<AlertKind>(['collection']), attended: false }),
    ).toBe('already-outstanding');
    expect(
      decideAlert({ kind: 'collection', outstanding: new Set<AlertKind>(['backup']), attended: false }),
    ).toEqual({ post: ALERT_NOTICES.collection });
  });
});

describe('clearing a сповіщення про збій', () => {
  it('takes off exactly the notice of the kind cleared', () => {
    expect(decideClear({ kind: 'monobank-sync', outstanding: ['collection', 'monobank-sync'] }))
      .toEqual({ dismiss: ALERT_NOTICES['monobank-sync'] });
  });

  it('has nothing to do when that kind is not outstanding', () => {
    // Both callers are unconditional — work succeeding, and the owner opening the screen — so
    // «нічого не було» is an answer and never a mistake (design D6).
    expect(decideClear({ kind: 'backup', outstanding: [] })).toBe('nothing-outstanding');
    expect(decideClear({ kind: 'backup', outstanding: ['collection'] })).toBe('nothing-outstanding');
  });

  it('Scenario: Clearing one leaves the others', () => {
    const outstanding: AlertKind[] = ['collection', 'monobank-sync'];
    const cleared = decideClear({ kind: 'collection', outstanding });
    expect(cleared).toEqual({ dismiss: ALERT_NOTICES.collection });
    const left = outstanding.filter((kind) => kind !== 'collection');
    expect(decideClear({ kind: 'monobank-sync', outstanding: left })).toEqual({
      dismiss: ALERT_NOTICES['monobank-sync'],
    });
  });
});
