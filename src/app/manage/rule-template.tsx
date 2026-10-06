import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ListItem, Tap } from '@/components/motion';
import { Action, Picker } from '@/components/form';
import { Chevron, ListCard, ListRow, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import {
  categories as categoriesRepo,
  ruleTemplate,
  transactions as transactionsRepo,
} from '@/db/repos';
import type { TemplateChoice } from '@/db/rule-template-repo';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { recentlyUsed } from '@/ui/category-choices';
import { failureAlert } from '@/ui/failure-alert';
import {
  TEMPLATE_PRECEDENCE_NOTE,
  chooseTemplateTarget,
  templateRowLine,
  templateRows,
  templateTargetRows,
  type TemplateRow,
} from '@/ui/rule-template-screen';
import { PICKER_SIZE } from '@/ui/shortlist';

import { Spacing } from '@/constants/theme';

/**
 * The «Базові категорії» section: the шаблон категоризації mapped onto this device's категорії
 * (settings-screen, "The «Базові категорії» section maps the шаблон onto this device's категорії").
 *
 * Every базова категорія is listed with where it lands now and whose decision that is. Opening one
 * shows what it covers — its merchant patterns and MCC codes, as text, not editable — and offers
 * pointing it at another категорія or switching it off. Each choice runs the розбір of «Без
 * категорії» and says what it moved, exactly as storing a правило does.
 */

/** How far back the picker looks for what the owner reached for last — the entry form's window. */
const RECENT_WINDOW = 50;

export default function RuleTemplateScreen() {
  const router = useRouter();

  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({
        choices: ruleTemplate.choices(),
        categories: categoriesRepo.list(),
        // What the owner reached for last, read off the latest транзакції, as the entry form does.
        latest: transactionsRepo.listLatest(RECENT_WINDOW),
      }),
      [],
    ),
  );

  const rows = useMemo(
    () => templateRows({ choices: stored.choices, categories: stored.categories }),
    [stored.categories, stored.choices],
  );
  const recent = useMemo(() => recentlyUsed(stored.latest, PICKER_SIZE), [stored.latest]);

  /** The базова категорія opened for a change; the phone's «назад» closes it first. */
  const [openId, setOpenId] = useState<string>();
  /** Whether its «Всі категорії» list is open: «назад» closes that before the базова категорія. */
  const [targetsOpen, setTargetsOpen] = useState(false);
  const close = useCallback(() => {
    setOpenId(undefined);
    setTargetsOpen(false);
  }, []);
  const closeTargets = useCallback(() => setTargetsOpen(false), []);
  useCloseOnBack(openId !== undefined && !targetsOpen, close);
  useCloseOnBack(targetsOpen, closeTargets);

  /** What the last choice's розбір moved, in the owner's words — nothing when it moved nothing. */
  const [sweptMessage, setSweptMessage] = useState<string>();

  const choose = useCallback(
    async (groupId: string, choice: TemplateChoice) => {
      try {
        const message = await chooseTemplateTarget(groupId, choice, (id, picked) =>
          ruleTemplate.choose(id, picked, new Date()),
        );
        setOpenId(undefined);
        setTargetsOpen(false);
        setSweptMessage(message);
        reload();
      } catch (error) {
        Alert.alert(
          ...failureAlert({ title: 'Не збережено', where: 'rule-template-choose', error, report: reportBug }),
        );
      }
    },
    [reload, reportBug],
  );

  const renderOpen = (row: TemplateRow) => (
    <View style={styles.open}>
      <ThemedText type="small" themeColor="textSecondary">
        {row.defaultCategoryName
          ? `Типова категорія: ${row.defaultCategoryName}`
          : 'Типової категорії немає на цьому пристрої'}
      </ThemedText>
      {/* What it covers, shown as it is: a merchant the шаблон gets wrong is corrected by the
          owner's own правило, not by editing the шаблон. */}
      {row.merchants.length > 0 ? (
        <ThemedText type="small">Продавці: {row.merchants.join(', ')}</ThemedText>
      ) : null}
      {row.mcc.length > 0 ? (
        <ThemedText type="small">MCC: {row.mcc.join(', ')}</ThemedText>
      ) : null}
      {/* A tap stores and sweeps, from the shown few and from the full list alike. */}
      <Picker
        label="Категорія"
        rows={templateTargetRows(stored.categories, row.categoryId)}
        recentIds={recent.categories}
        selected={row.categoryId}
        onSelect={(categoryId: string) =>
          void choose(row.groupId, { kind: 'category', categoryId })
        }
        noun="categories"
        expanded={targetsOpen}
        onExpandedChange={setTargetsOpen}
      />
      {row.state !== 'off' ? (
        <Action
          variant="secondary"
          title="Вимкнути"
          onPress={() => void choose(row.groupId, { kind: 'off' })}
        />
      ) : null}
      <Action variant="secondary" title="Закрити" onPress={close} />
    </View>
  );

  return (
    <Screen>
      <ScreenHeader
        title="Базові категорії"
        subtitle="Вбудоване знання про продавців і куди воно веде на цьому телефоні."
        back={() => router.back()}
      />

      <ThemedText type="small" themeColor="textSecondary">
        {TEMPLATE_PRECEDENCE_NOTE}
      </ThemedText>
      {sweptMessage ? (
        <ThemedText type="small" themeColor="textPositive">
          {sweptMessage}
        </ThemedText>
      ) : null}

      <ListCard>
        {rows.map((row, index) => (
          <ListItem key={row.groupId}>
            <ListRow last={index === rows.length - 1} style={styles.row}>
              {openId === row.groupId ? (
                <>
                  <ThemedText>{row.name}</ThemedText>
                  {renderOpen(row)}
                </>
              ) : (
                <Tap
                  accessibilityRole="button"
                  accessibilityHint="Показати, що вона охоплює, і змінити категорію"
                  onPress={() => {
                    setSweptMessage(undefined);
                    setTargetsOpen(false);
                    setOpenId(row.groupId);
                  }}
                  style={styles.rowTop}>
                  <View style={styles.text}>
                    <ThemedText numberOfLines={1}>{row.name}</ThemedText>
                    <ThemedText
                      type="small"
                      themeColor={row.state === 'off' ? 'textSecondary' : undefined}
                      numberOfLines={1}>
                      {templateRowLine(row)}
                    </ThemedText>
                  </View>
                  <Chevron />
                </Tap>
              )}
            </ListRow>
          </ListItem>
        ))}
      </ListCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  open: { gap: Spacing.three },
  row: { gap: Spacing.two },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  text: { flex: 1, gap: Spacing.half },
});
