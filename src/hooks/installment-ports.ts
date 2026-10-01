import { installments } from '@/db/repos';
import { localNotifications } from '@/platform/local-notifications-device';
import {
  settleAndReassertQuietly,
  type InstallmentUpkeepPorts,
} from '@/ui/installment-upkeep';

/**
 * The розстрочки' upkeep bound to this phone — storage, the notification shade and the clock
 * (installments design D4, D5). It sits in `src/hooks/` for `monobank-ports.ts`'s reason: it reaches
 * for a platform adapter, which nothing under `verify` may load. Every decision is
 * `src/ui/installment-upkeep.ts`'s.
 */
export const INSTALLMENT_UPKEEP_PORTS: InstallmentUpkeepPorts = {
  storage: installments,
  notifications: localNotifications,
  now: () => new Date(),
};

/** Settle and re-assert, journaling rather than throwing — for launch, background and restore. */
export const keepInstallmentsQuietly = (): Promise<void> =>
  settleAndReassertQuietly(INSTALLMENT_UPKEEP_PORTS);

/**
 * What a screen calls as it reads — Місяць, «Розстрочки», one розстрочка: the links are settled
 * synchronously, before the read that follows on the same tick, and the warnings re-asserted only
 * when settling changed something (installments design D4).
 */
export const settleInstallmentsOnFocus = (): void => {
  void settleAndReassertQuietly(INSTALLMENT_UPKEEP_PORTS, { only: 'if-changed' });
};
