import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { DraftLine } from '@/ui/drafts-section';
import { Field, RowAction } from './form';
import { ListRow } from './surfaces';
import { ThemedText } from './themed-text';

/**
 * One pending чернетка, owning what the owner types as its сума: a keystroke redraws this row and
 * nothing else (app-shell, "A long list draws only what is near the screen"; app-speed-pass design
 * D7). Answered in the queue «Що потребує відповіді» (answer-queue, "A чернетка is confirmed or
 * dismissed in the queue"): «Підтвердити» and «Відхилити» in place, a raw чернетка asking for its
 * сума first.
 */
export function DraftRow({
  line,
  last,
  onConfirm,
  onDismiss,
}: {
  line: DraftLine;
  last: boolean;
  onConfirm: (draftId: string, typedAmount: string | undefined) => void;
  onDismiss: (line: DraftLine) => void;
}) {
  const [amount, setAmount] = useState('');
  return (
    <ListRow last={last} style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowLabel}>
          <ThemedText numberOfLines={1}>{line.proposal}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`${line.accountName} · ${line.date}`}
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            {line.text}
          </ThemedText>
          {/* The foreign сума the notification named: information, never a proposal. */}
          {line.original ? (
            <ThemedText type="small" themeColor="textMuted">
              {line.original}
            </ThemedText>
          ) : null}
        </View>
        {line.amount ? (
          <ThemedText tabular style={styles.amount}>
            {line.amount}
          </ThemedText>
        ) : null}
      </View>

      {/* A raw чернетка has no сума of its own; it confirms only with one the owner
          supplies, in the рахунок's currency and under the manual-entry rules. */}
      {line.needsAmount ? (
        <Field
          label="Сума"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0,00"
          hint={line.currency}
        />
      ) : null}

      <View style={styles.rowActions}>
        <RowAction
          title="Підтвердити"
          onPress={() => onConfirm(line.id, line.needsAmount ? amount : undefined)}
        />
        <RowAction title="Відхилити" onPress={() => onDismiss(line)} />
      </View>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  rowLabel: { flex: 1, gap: Spacing.half },
  // `three`, not `two`: each `RowAction` carries `hitSlop` of `two`, and with no gap the pills touched.
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  amount: { fontWeight: 600 },
});
