/**
 * A write the app declined because of what the owner asked for — no рахунок chosen, a сума that is
 * not a number, a name that already exists — as opposed to one that failed because the app or
 * the device broke.
 *
 * The difference is who can fix it. A refusal is answered by the owner changing their input, so
 * its dialog says why and offers «Зрозуміло» and nothing else. A failure is the app's fault, and
 * its dialog offers «Повідомити про помилку» (`src/ui/failure-alert.ts`). Offering a bug report
 * for «оберіть рахунок» made every validation message read like a crash — QA found exactly that.
 *
 * Only the sentences the owner reads go through this class. The English invariants elsewhere
 * (`cannot combine UAH with EUR`, `stored transaction … is missing …`) stay plain `Error`s: they
 * mean the program is wrong, and a report is precisely what they deserve.
 *
 * It lives in `src/domain/` because refusals are thrown from every layer that validates — the
 * form rules in `src/ui/`, the repositories in `src/db/`, `src/monobank/link.ts` — and this is the
 * one layer all of them may import. It imports nothing itself.
 */
export class Refusal extends Error {
  constructor(message: string) {
    super(message);
    // Set in the constructor rather than as a class field so that `isRefusal` can recognise it by
    // name even where a transpiled subclass of `Error` loses its prototype and `instanceof` lies.
    this.name = 'Refusal';
  }
}

/** Whether a thrown value is the owner's to fix rather than the app's. */
export function isRefusal(error: unknown): error is Refusal {
  return error instanceof Refusal || (error instanceof Error && error.name === 'Refusal');
}
