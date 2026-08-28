import { describe, expect, it } from 'vitest';

import { EVIDENCE_STRENGTH, nameEvidence } from './name-match';

/**
 * The one definition of «these two names are the same account», shared by the monobank link
 * proposals and the Saldo import's merge proposals.
 */

describe('nameEvidence', () => {
  it('Scenario: A matching рахунок is proposed by name — one case per signal', () => {
    // The digits the bank masks a card down to, wherever the owner put them in their own name.
    expect(nameEvidence('black ··4321', 'Чорна 4321')).toBe('digits');
    expect(nameEvidence('black ··4321', 'Картка 5555 4321')).toBe('digits');
    // The same name written twice, punctuation and case aside.
    expect(nameEvidence('На відпустку', 'на, відпустку!')).toBe('same-name');
    // One name inside the other as an unbroken run.
    expect(nameEvidence('black', 'Monobank Black')).toBe('contains');
    // The weakest signal, and still worth proposing.
    expect(nameEvidence('black ··4321', 'Monobank Black')).toBe('word');
    expect(nameEvidence('РЕЗЕРВ', 'резерв usd')).toBe('contains');
  });

  it('Scenario: No shared evidence is no evidence', () => {
    expect(nameEvidence('black ··4321', 'Готівка')).toBeUndefined();
    // A three-letter word in both is below the floor: «fop» and «Фоп» would match everything.
    expect(nameEvidence('fop ··1111', 'fop карта')).toBeUndefined();
    expect(nameEvidence('usd ··1111', 'usd готівка')).toBeUndefined();
    expect(nameEvidence('', 'Готівка')).toBeUndefined();
    expect(nameEvidence('black ··4321', '')).toBeUndefined();
    // Different four-digit tails are not a match, and a short digit run is not a tail at all.
    expect(nameEvidence('black ··4321', 'Чорна 1234')).toBeUndefined();
    expect(nameEvidence('black ··4321', 'Рахунок 321')).toBeUndefined();
  });
});

describe('the strength order', () => {
  it('Puts the bank digits above every other signal and a shared word below them all', () => {
    // The order is what makes a tie a tie: two candidates matching on different signals are not
    // ambiguous, and the stronger one wins outright.
    expect(EVIDENCE_STRENGTH.digits).toBeGreaterThan(EVIDENCE_STRENGTH['same-name']);
    expect(EVIDENCE_STRENGTH['same-name']).toBeGreaterThan(EVIDENCE_STRENGTH.contains);
    expect(EVIDENCE_STRENGTH.contains).toBeGreaterThan(EVIDENCE_STRENGTH.word);
  });
});
