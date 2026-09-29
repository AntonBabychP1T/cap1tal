import type { DebtBalance } from '../saldo/verify';

/**
 * The sentence above «Борги після імпорту», said from the balances it sits over.
 *
 * It used to be one fixed line — «Усі борги з експорту закриті — тут має бути 0» — printed whatever
 * the balances were, so on the owner's export it read straight above «Борги: 820,00 UAH», claiming
 * what the next line disproved (QA). Every борг the export carries is expected to close, so 0 is
 * what each should read; the note says «закриті» only when every one does, and otherwise counts
 * the ones that did not and names why a борг stays open: a «Борг» row whose other half did not
 * pair. The count is «боргів: 1 з 2» rather than a declined noun, which reads right at any number.
 *
 * Here and not in `saldo-import.tsx`, because `verify` never runs JSX — a sentence built in the
 * screen is a sentence nothing proves (the same reason `planLine` lives in `./saldo-import`).
 */
export function debtsNote(debts: readonly DebtBalance[]): string {
  const open = debts.filter((debt) => debt.balance.amount !== 0).length;
  if (open === 0) {
    return 'Усі борги з експорту закриті — 0.';
  }
  return (
    `Не закрито боргів: ${open} з ${debts.length}. Не 0 — це рядок «Борг», ` +
    'друга половина якого не знайшла пари.'
  );
}
