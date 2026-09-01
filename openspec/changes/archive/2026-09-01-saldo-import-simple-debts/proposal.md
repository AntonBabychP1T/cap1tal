# saldo-import-simple-debts — proposal

## Why

The борги step of the Saldo import asks a question the owner cannot answer and does not need
answered, and refuses to commit the whole history until they answer it for every row.

Saldo recorded lending as an expense named «Борг» and a repayment as its refund. The export
carries years of those. The import today insists that each one names the person behind it — a
new рахунок-борг by name, or an existing one — and reports the plan incomplete while a single
one is unnamed. On a real export that is a wall of rows to be named one at a time, from memory,
before anything at all can be imported.

The owner's answer is that the question is the wrong one. Every debt the export holds is already
repaid — the money went out and came back, and it is closed. What is worth keeping about a closed
debt is that it happened, on that date, for that amount, on that рахунок. Who held the money in
2023 is not something the owner is tracking and not something the import should hold history
hostage for.

The account map has a second, smaller version of the same fault. The merge proposals added
alongside the on-row picker read the names and offered pairs — and on the owner's real export
every proposal was wrong: a shared word like «Monobank» is not evidence that two cards are one
card. Picking the target off the row is what actually helped. Wrong proposals in front of a step
that writes history are worse than none.

## What Changes

- **The борги step is gone.** Every «Борг» transaction becomes a переказ between its real рахунок
  and a рахунок-борг named «Борги» — lending out, a repayment back, as now — and the plan creates
  that рахунок-борг itself, one per currency the export's «Борг» rows use. The flow asks nothing
  about it: no name, no person, no description read.
- **A debt no longer blocks anything.** There is no incomplete plan, no unassigned list and no
  warning on the report; the map step leads straight to the звірка.
- **The report still states the balance of «Борги».** With every imported debt closed it should
  read 0, so a non-zero one is now what tells the owner something in the export did not pair.
- **The merge proposals go.** Nothing on the map step proposes a merge any more. The list of
  targets on the entry's own row — the part that worked — stays exactly as it is, and so does
  «Скасувати об'єднання».

## Non-goals

- **No change to рахунки-борги the owner keeps by hand.** One per person is still what the app
  models, and a debt entered today still names the person. This is about imported history only.
- **No change to the account map, категорії/джерела, the reconciliation report, the atomic commit
  or the second-import warning**, beyond removing the debt gate and the proposals.
- **No splitting of an over-repayment** into principal and «Відсотки» — FR-T9, still out.
- **No guessing from the «Борг» description.** It is not read to name a person, and it does not
  name the рахунок-борг either. Removing the guess is the point; a weaker guess is not.
