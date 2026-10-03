import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { ObservationLine } from '@/ui/observations';
import { RowAction } from './form';
import { Tap } from './motion';
import { Chevron, ListCard, ListRow } from './surfaces';
import { ThemedText } from './themed-text';

/**
 * A month's спостереження as rows — shared by Головний, Місяць and the підсумок місяця, so all three
 * say and lead the same way. Every word and route is `src/ui/observations.ts`'s; this is layout.
 *
 * A sentence that leads somewhere is one button. A можливий дубль is not: its two транзакції are
 * each a button of their own, and «Не дубль» answers the pair in place — the caller stores the
 * answer and the list, re-derived, no longer holds it.
 */
export function ObservationsList({
  lines,
  onOpen,
  onNotDuplicate,
}: {
  readonly lines: readonly ObservationLine[];
  readonly onOpen: (route: string) => void;
  readonly onNotDuplicate: (pair: { readonly first: string; readonly second: string }) => void;
}) {
  return (
    <ListCard>
      {lines.map((line, index) => (
        <ListRow key={line.key} last={index === lines.length - 1} style={styles.row}>
          {line.halves ? (
            <View style={styles.duplicate}>
              <ThemedText type="small">{line.sentence}</ThemedText>
              {line.halves.map((half) => (
                <Tap
                  key={half.id}
                  onPress={() => onOpen(half.route)}
                  accessibilityRole="button"
                  accessibilityLabel={half.accessibilityLabel}
                  style={styles.half}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
                    {half.label}
                  </ThemedText>
                  <Chevron />
                </Tap>
              ))}
              {line.answer ? (
                <View style={styles.answer}>
                  <RowAction title="Не дубль" tone="quiet" onPress={() => onNotDuplicate(line.answer!)} />
                </View>
              ) : null}
            </View>
          ) : (
            <Tap
              onPress={line.route ? () => onOpen(line.route!) : undefined}
              accessibilityRole="button"
              accessibilityLabel={line.sentence}
              style={styles.line}>
              <ThemedText type="small" style={styles.text}>
                {line.sentence}
              </ThemedText>
              <Chevron />
            </Tap>
          )}
        </ListRow>
      ))}
    </ListCard>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: Spacing.twoHalf },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  text: { flex: 1 },
  duplicate: { gap: Spacing.oneHalf },
  half: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  answer: { flexDirection: 'row', justifyContent: 'flex-end' },
});
