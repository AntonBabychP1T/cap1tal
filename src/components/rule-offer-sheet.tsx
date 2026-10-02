import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Action, Field } from './form';
import { Sheet } from './sheet';
import { ThemedText } from './themed-text';

import { ruleOfferView, type RuleCriterion, type RuleOffer } from '@/ui/list-management';
import { Spacing } from '@/constants/theme';

/**
 * «Запамʼятати правило?» — the offer that follows a категорія just set on a витрата or
 * повернення that carries an опис. `ruleOffer` in `src/ui/list-management.ts` decides whether one
 * exists at all and what it would say, and `ruleOfferView` how it reads; this is only the asking,
 * because `verify` never runs JSX (rules-everywhere design D5, D6).
 *
 * When the опис is recognised as a продавець the offer names «продавець <назва>» and lets the owner
 * switch to the pattern proposed from the опис instead (merchant-normalization, main-screen); the
 * pattern is editable either way it is reached.
 *
 * The категорія is already stored by the time this sheet can be showing at all — the caller sets
 * `offer` only after that write succeeds — so the phone's «назад», the backdrop and «Не треба» can
 * all dismiss it for free: declining changes nothing that is not already true.
 */
export function RuleOfferSheet({
  offer,
  targetLabel,
  onAccept,
  onDecline,
  onExited,
}: {
  offer: RuleOffer | undefined;
  /** The category's name, or «переказ на <назва>» for a правило-переказ (design D6). */
  targetLabel: string;
  onAccept: (criterion: RuleCriterion) => void;
  onDecline: () => void;
  /** Once the sheet has left, however it was answered — where a screen change after it belongs. */
  onExited?: () => void;
}) {
  /**
   * The pattern as the owner may edit it, and whether they switched to it, seeded fresh from each
   * new offer that arrives — adjusted during render rather than in an effect, since it is state
   * derived from a prop change and not a subscription to anything outside React.
   */
  const [seededFor, setSeededFor] = useState(offer);
  const [pattern, setPattern] = useState(offer?.merchant ?? '');
  const [usePattern, setUsePattern] = useState(false);
  if (offer !== seededFor) {
    setSeededFor(offer);
    setPattern(offer?.merchant ?? '');
    setUsePattern(false);
  }
  const view = offer ? ruleOfferView(offer, usePattern, pattern) : undefined;

  return (
    <Sheet
      open={offer !== undefined}
      title="Запамʼятати правило?"
      onClose={onDecline}
      onExited={onExited}>
      <View style={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          Наступного разу такий опис одразу піде в цю категорію.
        </ThemedText>
        {view?.showsPattern === false ? (
          <ThemedText type="rowTitle">{view.merchantLabel}</ThemedText>
        ) : (
          <Field
            label="Продавець"
            value={pattern}
            onChangeText={setPattern}
            autoCapitalize="none"
          />
        )}
        <ThemedText>→ {targetLabel}</ThemedText>
      </View>
      <View style={styles.actions}>
        <Action title="Запамʼятати" onPress={() => view && onAccept(view.criterion)} />
        {view?.canSwitchToPattern ? (
          <Action variant="secondary" title="Замість продавця — текст опису" onPress={() => setUsePattern(true)} />
        ) : null}
        <Action variant="secondary" title="Не треба" onPress={onDecline} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
});
