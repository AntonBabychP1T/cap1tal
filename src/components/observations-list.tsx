import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import {
  answeredDuplicate,
  deleteOneConfirmation,
  observationRows,
  type AnsweredDuplicate,
  type DeleteOneChoice,
  type DeleteOneView,
  type ObservationLine,
  type ObservationsMore,
} from '@/ui/observations';
import { Action, RowAction } from './form';
import { Tap } from './motion';
import { Sheet } from './sheet';
import { Chevron, ListCard, ListRow } from './surfaces';
import { ThemedText } from './themed-text';

type Pair = { readonly first: string; readonly second: string };

/**
 * A month's спостереження as rows — shared by Головний, Місяць and the підсумок місяця, so all three
 * say and lead the same way. Every word and route is `src/ui/observations.ts`'s; this is layout.
 *
 * A sentence that leads somewhere is one button. A можливий дубль is not: its two транзакції are
 * each a button of their own, «Не дубль» answers the pair in place and «Видалити одну» deletes one
 * of the two after asking which and confirming (design D10). The caller stores the answer and
 * re-reads the list, which no longer holds the pair; this list keeps «Позначено: не дубль ·
 * Скасувати» where the pair stood until the screen is left, and «Скасувати» brings the pair back.
 * With no row at all it says `empty` instead, inside the same card, so a list whose last pair was
 * just answered stays mounted to offer the undo. `more` is Місяць's and the підсумок's «Ще N»
 * (design D11): its row closes the card and `onMore` shows the rest in place.
 */
export function ObservationsList({
  lines,
  empty,
  more,
  onMore,
  onOpen,
  onNotDuplicate,
  onUndoNotDuplicate,
  onDeleteOne,
}: {
  readonly lines: readonly ObservationLine[];
  /** The sentence for a month with none; nothing is drawn when absent. */
  readonly empty?: string | null;
  /** «Ще N» past the lines shown; nothing is drawn when absent. */
  readonly more?: ObservationsMore | null;
  readonly onMore?: () => void;
  readonly onOpen: (route: string) => void;
  readonly onNotDuplicate: (pair: Pair) => void;
  readonly onUndoNotDuplicate: (pair: Pair) => void;
  readonly onDeleteOne: (id: string) => void;
}) {
  const [answered, setAnswered] = useState<readonly AnsweredDuplicate[]>([]);
  const [deleting, setDeleting] = useState<DeleteOneView | undefined>(undefined);
  const [chosen, setChosen] = useState<DeleteOneChoice | undefined>(undefined);

  // Leaving the screen re-reads the list on return: what was answered here is simply not stated.
  useFocusEffect(useCallback(() => () => setAnswered([]), []));

  const rows = observationRows(lines, answered);

  const answer = (line: ObservationLine, index: number) => {
    const remembered = answeredDuplicate(line, index);
    if (!remembered) return;
    setAnswered((list) => [...list.filter((a) => a.key !== remembered.key), remembered]);
    onNotDuplicate(remembered.pair);
  };

  const undo = (key: string, pair: Pair) => {
    setAnswered((list) => list.filter((a) => a.key !== key));
    onUndoNotDuplicate(pair);
  };

  // The confirmation is asked once the sheet has left, so the two never stand over each other.
  const confirmChosen = () => {
    if (!chosen) return;
    const confirmation = deleteOneConfirmation(chosen);
    setChosen(undefined);
    Alert.alert(confirmation.title, confirmation.message, [
      { text: confirmation.cancel, style: 'cancel' },
      {
        text: confirmation.confirm,
        style: 'destructive',
        onPress: () => onDeleteOne(confirmation.id),
      },
    ]);
  };

  if (rows.length === 0) {
    return empty ? (
      <ListCard>
        <ListRow last style={styles.row}>
          <ThemedText type="small" themeColor="textSecondary">
            {empty}
          </ThemedText>
        </ListRow>
      </ListCard>
    ) : null;
  }

  const folded = more && onMore ? more : null;

  return (
    <>
      <ListCard>
        {rows.map((row, index) => (
          <ListRow key={row.key} last={!folded && index === rows.length - 1} style={styles.row}>
            {row.kind === 'answered' ? (
              <View style={styles.marked}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
                  {row.sentence}
                </ThemedText>
                <RowAction title={row.undoLabel} tone="quiet" onPress={() => undo(row.key, row.pair)} />
              </View>
            ) : row.line.halves ? (
              <View style={styles.duplicate}>
                <ThemedText type="small">{row.line.sentence}</ThemedText>
                {row.line.halves.map((half) => (
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
                <View style={styles.answer}>
                  {row.line.deleteOne ? (
                    <RowAction
                      title={row.line.deleteOne.label}
                      tone="quiet"
                      onPress={() => setDeleting(row.line.deleteOne)}
                    />
                  ) : null}
                  {row.line.answer ? (
                    <RowAction title="Не дубль" tone="quiet" onPress={() => answer(row.line, index)} />
                  ) : null}
                </View>
              </View>
            ) : (
              <Tap
                onPress={row.line.route ? () => onOpen(row.line.route!) : undefined}
                accessibilityRole="button"
                accessibilityLabel={row.line.sentence}
                style={styles.line}>
                <ThemedText type="small" style={styles.text}>
                  {row.line.sentence}
                </ThemedText>
                <Chevron />
              </Tap>
            )}
          </ListRow>
        ))}
        {folded ? (
          <ListRow last style={styles.row}>
            <Tap
              onPress={onMore}
              accessibilityRole="button"
              accessibilityLabel={folded.accessibilityLabel}
              style={styles.line}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.text}>
                {folded.label}
              </ThemedText>
            </Tap>
          </ListRow>
        ) : null}
      </ListCard>
      <Sheet
        open={deleting !== undefined}
        title={deleting?.title ?? ''}
        onClose={() => setDeleting(undefined)}
        onExited={confirmChosen}>
        <ThemedText type="small" themeColor="textSecondary">
          {deleting?.sentence}
        </ThemedText>
        {deleting?.choices.map((choice) => (
          <Action
            key={choice.id}
            title={choice.label}
            variant="secondary"
            onPress={() => {
              setChosen(choice);
              setDeleting(undefined);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: Spacing.twoHalf },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  text: { flex: 1 },
  duplicate: { gap: Spacing.oneHalf },
  half: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  answer: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  marked: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
