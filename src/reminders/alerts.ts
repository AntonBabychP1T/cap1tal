import { alertNotice, type AlertKind, type Notice } from './notices';

/**
 * Whether a failure becomes a сповіщення про збій, and whether clearing one has anything to do.
 *
 * Both are pure functions of the two facts the caller already holds: which kinds are outstanding,
 * and whether the owner is looking at the screen this failure belongs to. Nothing here reads
 * storage, posts anything or knows what time it is — `src/ui/alerting.ts` is the half that acts,
 * and it acts on these answers (design D5, D6).
 *
 * Two rules live here and nowhere else. One failure is one сповіщення: a kind already outstanding
 * is not raised a second time however often the same work fails, so «залишилось» being wrong is
 * announced once and not once per retry. And a failure the owner is already reading raises
 * nothing: the screen that would raise it is in front of them, telling them the same thing in more
 * words than a notification may carry.
 */

/** What raising a failure comes to. `attended` and `already-outstanding` both post nothing. */
export type AlertDecision =
  /** Post this notice and remember the kind as outstanding. */
  | { readonly post: Notice }
  /** The owner is on the screen that explains it; it is reported there and nowhere else. */
  | 'attended'
  /** This kind is already outstanding: one failure is one сповіщення. */
  | 'already-outstanding';

export interface AlertQuestion {
  readonly kind: AlertKind;
  /** The kinds outstanding right now — storage's answer, passed in rather than read. */
  readonly outstanding: ReadonlySet<AlertKind> | readonly AlertKind[];
  /**
   * Whether the screen that explains *this* failure is in front of the owner. Decided by the
   * caller, because only the caller knows: a screen passes whether the app is active, and
   * unattended work — the drain, a scheduled upload — passes `false` unconditionally (design D5).
   */
  readonly attended: boolean;
}

function has(outstanding: AlertQuestion['outstanding'], kind: AlertKind): boolean {
  return outstanding instanceof Set ? outstanding.has(kind) : [...outstanding].includes(kind);
}

/**
 * Whether this failure is announced.
 *
 * `attended` is asked first: a failure the owner is reading is not merely un-posted, it is not
 * recorded as outstanding either — there is nothing left for a later «відкрив екран» to clear, and
 * the same failure while they are away still announces itself normally.
 */
export function decideAlert(question: AlertQuestion): AlertDecision {
  if (question.attended) {
    return 'attended';
  }
  if (has(question.outstanding, question.kind)) {
    return 'already-outstanding';
  }
  return { post: alertNotice(question.kind) };
}

/** What clearing a kind comes to: the notice to take off the phone, or nothing to do. */
export type ClearDecision = { readonly dismiss: Notice } | 'nothing-outstanding';

/**
 * Whether clearing has anything to do. Answered by kind only and idempotent, because both callers
 * are unconditional: the work of that kind succeeding, and the owner opening the screen it leads
 * to (design D6). Neither knows whether anything was outstanding, and neither should have to.
 */
export function decideClear(question: {
  readonly kind: AlertKind;
  readonly outstanding: ReadonlySet<AlertKind> | readonly AlertKind[];
}): ClearDecision {
  return has(question.outstanding, question.kind)
    ? { dismiss: alertNotice(question.kind) }
    : 'nothing-outstanding';
}
