import type { IsoDate } from '../domain/transaction';
import { commitmentsRepo } from './commitments-repo';
import { installmentsRepo } from './installments-repo';
import type { Storage } from './storage';

/** What one settle of both plans changed. */
export interface PlansSettled {
  readonly installments: boolean;
  readonly commitments: boolean;
}

/**
 * Settles both plans in **one** `immediate` write (commitments design D4): the розстрочки' платежі
 * first, then the зобов'язання' — which read the розстрочки' links as they stand after the first —
 * so, of the витрати not linked yet, one that would qualify for both is the розстрочка's, even when
 * a background прогін commits between the two (two separate transactions would not guarantee it).
 *
 * **Writes nothing when neither has anything to do**: the dry run is read outside the lock, and
 * only a pending change opens the write — so storage's change stamp stays put on every focus.
 */
export function settlePlans(db: Storage, today: IsoDate): PlansSettled {
  const installments = installmentsRepo(db);
  const commitments = commitmentsRepo(db);
  if (!installments.pending(today) && !commitments.pending(today)) {
    return { installments: false, commitments: false };
  }
  return db.transaction(
    (tx) => ({
      installments: installments.settleIn(tx, today),
      commitments: commitments.settleIn(tx, today),
    }),
    { behavior: 'immediate' },
  );
}
