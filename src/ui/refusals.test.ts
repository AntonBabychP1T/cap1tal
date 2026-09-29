import { describe, expect, it } from 'vitest';

import { isRefusal } from '../domain/refusal';
import { accountFromDraft, blankDraft } from './account-form';
import { parseActualBalance, parseAmount } from './amount-input';
import { parseTypedDate } from './dates';
import { buildEntry } from './entry-form';
import { failureAlert, REFUSAL_LABEL, REPORT_LABEL } from './failure-alert';

/**
 * The form rules refuse with `Refusal`, so the dialog they end in offers «Зрозуміло» and not
 * «Повідомити про помилку». QA found «оберіть рахунок» offering a bug report: a validation message
 * the owner fixes by choosing a рахунок is not the app breaking.
 *
 * One census for all of them rather than a line in each module's own test, because the property
 * is the same everywhere — what was thrown is the owner's to fix — and it is the dialog, in the
 * end, that has to tell the two apart.
 */

/** What the dialog would offer for whatever `run` throws. */
function offered(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    expect(isRefusal(error), `«${String(error)}» is thrown as a plain Error`).toBe(true);
    const [, , buttons] = failureAlert({ title: 'Не записано', where: 'test', error, report: () => undefined });
    return buttons.map((b) => b.text);
  }
  throw new Error('nothing was refused');
}

describe('validation refusals offer no репорт', () => {
  it('Recording without a рахунок: «оберіть рахунок»', () => {
    expect(
      offered(() => buildEntry({ type: 'expense', amount: '10', date: '2026-09-01' }, { id: 'e', accounts: [] })),
    ).toEqual([REFUSAL_LABEL]);
  });

  it('A сума that is not a number, or is missing', () => {
    expect(offered(() => parseAmount('abc', 'UAH'))).toEqual([REFUSAL_LABEL]);
    expect(offered(() => parseAmount('0', 'UAH'))).toEqual([REFUSAL_LABEL]);
    expect(offered(() => parseActualBalance('', 'UAH'))).toEqual([REFUSAL_LABEL]);
  });

  it('A дата written wrong, or a day the calendar does not have', () => {
    expect(offered(() => parseTypedDate('31 грудня'))).toEqual([REFUSAL_LABEL]);
    expect(offered(() => parseTypedDate('2026-02-30'))).toEqual([REFUSAL_LABEL]);
  });

  it('A рахунок without a name', () => {
    expect(offered(() => accountFromDraft(blankDraft(), 'a1'))).toEqual([REFUSAL_LABEL]);
  });

  it('A genuine failure still offers the репорт', () => {
    const [, , buttons] = failureAlert({
      title: 'Не записано',
      where: 'test',
      error: new Error('database is locked'),
      report: () => undefined,
    });
    expect(buttons.map((b) => b.text)).toContain(REPORT_LABEL);
  });
});
