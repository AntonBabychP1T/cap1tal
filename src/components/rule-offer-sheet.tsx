import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Action, Field } from './form';
import { Sheet } from './sheet';
import { ThemedText } from './themed-text';

import type { RuleOffer } from '@/ui/list-management';
import { Spacing } from '@/constants/theme';

/**
 * «Запамʼятати правило?» — the offer that follows a категорія just set on a витрата or
 * повернення that carries an опис. `ruleOffer` in `src/ui/list-management.ts` decides whether one
 * exists at all and what it would say; this is only the asking, because `verify` never runs JSX
 * (rules-everywhere design D5, D6).
 *
 * The категорія is already stored by the time this sheet can be showing at all — the caller sets
 * `offer` only after that write succeeds — so the phone's «назад», the backdrop and «Не треба» can
 * all dismiss it for free: declining changes nothing that is not already true.
 */
export function RuleOfferSheet({
  offer,
  categoryName,
  onAccept,
  onDecline,
}: {
  offer: RuleOffer | undefined;
  categoryName: string;
  onAccept: (merchant: string) => void;
  onDecline: () => void;
}) {
  /**
   * The pattern as the owner may edit it, seeded fresh from each new offer that arrives — adjusted
   * during render rather than in an effect, since it is state derived from a prop change and not a
   * subscription to anything outside React.
   */
  const [seededFor, setSeededFor] = useState(offer);
  const [pattern, setPattern] = useState(offer?.merchant ?? '');
  if (offer !== seededFor) {
    setSeededFor(offer);
    setPattern(offer?.merchant ?? '');
  }

  return (
    <Sheet open={offer !== undefined} title="Запамʼятати правило?" onClose={onDecline}>
      <View style={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          Наступного разу такий опис одразу піде в цю категорію.
        </ThemedText>
        <Field
          label="Продавець"
          value={pattern}
          onChangeText={setPattern}
          autoCapitalize="none"
        />
        <ThemedText>→ {categoryName}</ThemedText>
      </View>
      <View style={styles.actions}>
        <Action title="Запамʼятати" onPress={() => onAccept(pattern)} />
        <Action variant="secondary" title="Не треба" onPress={onDecline} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
});
