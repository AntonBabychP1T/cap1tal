import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { merchants as merchantsRepo, rules as rulesRepo } from '@/db/repos';
import type { Account } from '@/domain/account';
import type { CurrencyCode } from '@/domain/money';
import type { RuleTarget } from '@/domain/rules';
import { failureAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import { useHaptics } from '@/hooks/haptics-ports';
import {
  ruleDraftFromOffer,
  ruleFromDraft,
  ruleOffer,
  storeRule,
  type RuleCriterion,
  type RuleOffer,
} from '@/ui/list-management';

/**
 * The offer to remember a правило, wired for a screen: raising it after a категорія is stored,
 * showing it, and answering it — accept or decline (rules-everywhere design D5, D6).
 *
 * `raise` reads `rulesRepo.list()` at the moment it is called, so a правило stored moments earlier
 * on the same screen is already accounted for. `accept` goes through the same `ruleFromDraft` and
 * `storeRule` every screen that stores a правило uses, so the refusals — an emptied pattern — are
 * one set of words in one place.
 *
 * `raise` returns what it decided, not only sets it: `ruleOffer` legitimately answers "no offer"
 * — no опис, «Без категорії», a правило that already covers it — and a caller that navigates away
 * only when an offer is showing (the editing screen, which used to navigate unconditionally) has
 * to know which of those two happened right now, not on the next render.
 *
 * This lives in `src/hooks/` and not `src/ui/` because it holds React state and touches
 * `Alert`; the decisions it wraps are already pure and already under `verify`.
 */
export function useRuleOffer(reportBug: (entryId: string) => void) {
  const [offer, setOffer] = useState<RuleOffer | undefined>();
  const haptics = useHaptics();

  const raise = useCallback(
    (input: {
      description?: string;
      target: RuleTarget;
      fromAccount?: { accountId: string; currency: CurrencyCode };
      accounts?: readonly Pick<Account, 'id' | 'currency'>[];
    }): RuleOffer | undefined => {
      const proposed = ruleOffer({ ...input, rules: rulesRepo.list(), merchants: merchantsRepo.index() });
      setOffer(proposed);
      return proposed;
    },
    [],
  );

  const decline = useCallback(() => setOffer(undefined), []);

  const accept = useCallback(
    async (criterion: RuleCriterion) => {
      if (!offer) {
        return;
      }
      try {
        const rule = ruleFromDraft(ruleDraftFromOffer(offer, criterion), {
          id: newId(),
          createdAt: new Date(),
        });
        await storeRule(rule, rulesRepo.save);
        // The sheet's accept is its own owner action, after the store it followed: felt once the
        // правило is written (motion, "An outcome the owner caused is felt once").
        haptics.play('rule-accepted');
        setOffer(undefined);
      } catch (error) {
        Alert.alert(
          ...failureAlert({
            title: 'Не збережено',
            where: 'rule-offer-save',
            error,
            report: reportBug,
          }),
        );
      }
    },
    [haptics, offer, reportBug],
  );

  return { offer, raise, accept, decline };
}
