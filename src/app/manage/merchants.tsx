import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MerchantNamingSheet } from '@/components/merchant-naming-sheet';
import { Tap } from '@/components/motion';
import { RowAction } from '@/components/form';
import { Chevron, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { merchants as merchantsRepo, storedHistory } from '@/db/repos';
import { merchantIndex } from '@/domain/merchants';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { transactionCount } from '@/ui/labels';
import {
  EVERYTHING_RECOGNISED,
  NO_MERCHANTS_YET,
  merchantRows,
  namelessGroups,
  namelessMore,
  namingFormFor,
  type NamingForm,
} from '@/ui/merchants-screen';

import { Spacing } from '@/constants/theme';

/**
 * «Продавці» in Налаштування (merchants-screen): «Без продавця» first — the most frequent описи no
 * продавець recognises, each with «Назвати» — then the owner's продавці with how many транзакції each
 * recognises. Every decision is `src/ui/merchants-screen.ts`'s; this file is the wiring.
 *
 * The whole history is read once (`storedHistory`, remembered under the change stamp): grouping the
 * nameless описи needs every one of them, so this list does not page (design M10).
 */
export default function MerchantsScreen() {
  const router = useRouter();
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({ transactions: storedHistory.read().transactions, merchants: merchantsRepo.list() }),
      [],
    ),
  );
  const index = useMemo(() => merchantIndex(stored.merchants), [stored.merchants]);
  const nameless = useMemo(() => namelessGroups(stored.transactions, index), [index, stored.transactions]);
  const rows = useMemo(
    () => merchantRows(stored.merchants, stored.transactions, index),
    [index, stored.merchants, stored.transactions],
  );

  /** The naming form open over the screen; the phone's «назад» closes it first. */
  const [naming, setNaming] = useState<NamingForm>();
  const close = useCallback(() => setNaming(undefined), []);
  useCloseOnBack(naming !== undefined, close);
  /** What the last naming's розбір moved, in the owner's words — nothing when it moved nothing. */
  const [sweptMessage, setSweptMessage] = useState<string>();
  const more = namelessMore(nameless.more);

  return (
    <Screen>
      <ScreenHeader
        title="Продавці"
        subtitle="Одна назва для всіх написань, якими банк пише магазин."
        back={() => router.back()}
      />
      {sweptMessage ? (
        <ThemedText type="small" themeColor="textPositive">
          {sweptMessage}
        </ThemedText>
      ) : null}

      <SectionLabel count={nameless.groups.length + nameless.more}>Без продавця</SectionLabel>
      {nameless.groups.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {EVERYTHING_RECOGNISED}
        </ThemedText>
      ) : (
        <ListCard>
          {nameless.groups.map((group, n) => (
            <ListRow key={group.spelling} last={n === nameless.groups.length - 1} style={styles.row}>
              <View style={styles.rowText}>
                <ThemedText numberOfLines={2}>{group.description}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {transactionCount(group.count)}
                </ThemedText>
              </View>
              <RowAction
                title="Назвати"
                onPress={() => {
                  setSweptMessage(undefined);
                  setNaming(namingFormFor(group.description));
                }}
              />
            </ListRow>
          ))}
        </ListCard>
      )}
      {more ? (
        <ThemedText type="small" themeColor="textMuted">
          {more}
        </ThemedText>
      ) : null}

      <SectionLabel count={rows.length}>Ваші продавці</SectionLabel>
      {rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {NO_MERCHANTS_YET}
        </ThemedText>
      ) : (
        <ListCard>
          {rows.map((row, n) => (
            <ListRow key={row.id} last={n === rows.length - 1}>
              <Tap
                accessibilityRole="button"
                accessibilityHint="Відкрити продавця"
                onPress={() => router.push({ pathname: '/merchant/[id]', params: { id: row.id } })}
                style={styles.merchant}>
                <ThemedText numberOfLines={1} style={styles.name}>
                  {row.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.countLabel}
                </ThemedText>
                <Chevron />
              </Tap>
            </ListRow>
          ))}
        </ListCard>
      )}

      <MerchantNamingSheet
        form={naming}
        merchants={stored.merchants}
        onClose={close}
        onStored={(said) => {
          setNaming(undefined);
          setSweptMessage(said);
          reload();
        }}
        reportBug={reportBug}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  rowText: { flex: 1, gap: Spacing.half },
  merchant: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 40 },
  name: { flex: 1 },
});
