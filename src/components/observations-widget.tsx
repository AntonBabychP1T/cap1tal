import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { ObservationsWidgetModel } from '@/ui/observations';
import { Tap } from './motion';
import { Card, Chevron, SectionLabel } from './surfaces';
import { ObservationsList } from './observations-list';
import { ThemedText } from './themed-text';

/**
 * «Спостереження» on Головний (main-screen, "The «Спостереження» widget points at what is notable
 * this month"): in the first week of a month the previous month's підсумок, then up to three of the
 * current month's спостереження, «Усі (N)» beside the heading when there are more, or one sentence
 * when there are none. Showing it writes, posts and requests nothing; every word is
 * `observationsWidgetModel`'s.
 */
export function ObservationsWidget({
  model,
  onOpen,
  onNotDuplicate,
}: {
  readonly model: ObservationsWidgetModel;
  readonly onOpen: (route: string) => void;
  readonly onNotDuplicate: (pair: { readonly first: string; readonly second: string }) => void;
}) {
  return (
    <View style={styles.widget}>
      <SectionLabel
        {...(model.more ? { action: { label: `${model.more.label} ›`, onPress: () => onOpen(model.more!.route) } } : {})}>
        Спостереження
      </SectionLabel>
      {model.summary ? (
        <Tap
          onPress={() => onOpen(model.summary!.route)}
          accessibilityRole="button"
          accessibilityLabel={model.summary.accessibilityLabel}>
          <Card tone="accent" style={styles.summary}>
            <ThemedText type="smallBold" style={styles.text}>
              {model.summary.label}
            </ThemedText>
            <Chevron />
          </Card>
        </Tap>
      ) : null}
      {model.empty ? (
        <ThemedText type="small" themeColor="textSecondary">
          {model.empty}
        </ThemedText>
      ) : (
        <ObservationsList lines={model.lines} onOpen={onOpen} onNotDuplicate={onNotDuplicate} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  widget: { gap: Spacing.two },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  text: { flex: 1 },
});
