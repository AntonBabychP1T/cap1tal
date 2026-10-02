import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Field, Picker, RowAction } from '@/components/form';
import { Card, ListCard, ListRow, Screen, ScreenHeader, SectionLabel } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { merchants as merchantsRepo } from '@/db/repos';
import type { Merchant } from '@/domain/merchants';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { failureAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import {
  addedSpellingError,
  changeAndSay,
  deleteOutcome,
  mergeConfirmation,
  merchantTransactionsHref,
  renameError,
  spellingRows,
} from '@/ui/merchants-screen';

import { Spacing } from '@/constants/theme';

/**
 * One продавець's screen (merchants-screen, "A продавець's screen manages it"): its назва and every
 * написання, with renaming, adding and removing a написання while more than one is held,
 * «Обʼєднати з…», «Видалити» and its «Транзакції». Every change but a rename is followed by the
 * розбір of «Без категорії», and what it moved is said here.
 */
export default function MerchantScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [stored, reload] = useReloadOnFocus(
    useCallback(() => {
      const merchants = merchantsRepo.list();
      return { merchants, rulesNaming: merchantsRepo.rulesNaming(id) };
    }, [id]),
  );
  const merchant = stored.merchants.find((m) => m.id === id);

  // A продавець merged or deleted from under the screen — or an id that never named one — says so
  // rather than drawing someone else's написання.
  if (!merchant) {
    return (
      <Screen>
        <ScreenHeader title="Продавець" back={() => router.back()} />
        <ThemedText type="small" themeColor="textSecondary">
          Такого продавця немає.
        </ThemedText>
      </Screen>
    );
  }
  return (
    <MerchantView
      key={merchant.id}
      merchant={merchant}
      merchants={stored.merchants}
      rulesNaming={stored.rulesNaming}
      reload={reload}
    />
  );
}

function MerchantView({
  merchant,
  merchants,
  rulesNaming,
  reload,
}: {
  merchant: Merchant;
  merchants: readonly Merchant[];
  rulesNaming: number;
  reload: () => void;
}) {
  const router = useRouter();
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );
  const others = useMemo(() => merchants.filter((m) => m.id !== merchant.id), [merchant.id, merchants]);
  const stored = { merchants, rulesNaming };

  const [name, setName] = useState<string>();
  const [nameError, setNameError] = useState<string>();
  const [added, setAdded] = useState('');
  const [addedError, setAddedError] = useState<string>();
  const [merging, setMerging] = useState(false);
  const [mergeListOpen, setMergeListOpen] = useState(false);
  const closeMerging = useCallback(() => setMerging(false), []);
  useCloseOnBack(merging, closeMerging);
  /** What the last change's розбір moved, in the owner's words — nothing when it moved nothing. */
  const [sweptMessage, setSweptMessage] = useState<string>();

  /** One change, said and re-read; a refusal comes back through `failureAlert` as the owner's to fix. */
  const change = useCallback(
    async (what: string, run: () => ReturnType<typeof merchantsRepo.addSpelling>) => {
      try {
        const said = await changeAndSay(what, run);
        setSweptMessage(said);
        reload();
        return true;
      } catch (error) {
        Alert.alert(...failureAlert({ title: 'Не збережено', where: `merchant-${what}`, error, report: reportBug }));
        return false;
      }
    },
    [reload, reportBug],
  );

  const shownName = name ?? merchant.name;
  const rename = () => {
    const refused = renameError(shownName, merchant, stored.merchants);
    setNameError(refused);
    if (refused) return;
    try {
      merchantsRepo.rename(merchant.id, shownName);
      setName(undefined);
      reload();
    } catch (error) {
      Alert.alert(...failureAlert({ title: 'Не збережено', where: 'merchant-rename', error, report: reportBug }));
    }
  };

  const addSpelling = async () => {
    const refused = addedSpellingError(added, stored.merchants);
    setAddedError(refused);
    if (refused) return;
    const ok = await change('spelling-add', () =>
      merchantsRepo.addSpelling({ merchantId: merchant.id, spelling: added, spellingId: newId(), now: new Date() }),
    );
    if (ok) setAdded('');
  };

  const mergeInto = (intoId: string) => {
    const into = stored.merchants.find((m) => m.id === intoId);
    if (!into) return;
    Alert.alert('Обʼєднати продавців?', mergeConfirmation(merchant, into, stored.rulesNaming), [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Обʼєднати',
        style: 'destructive',
        onPress: () =>
          void change('merge', () => merchantsRepo.merge(merchant.id, into.id, new Date())).then((ok) => {
            if (!ok) return;
            setMerging(false);
            // The owner lands on the продавець that remains, holding both sets of написання.
            router.replace({ pathname: '/merchant/[id]', params: { id: into.id } });
          }),
      },
    ]);
  };

  const remove = () => {
    const outcome = deleteOutcome(merchant, stored.rulesNaming);
    if (outcome.kind === 'refused') {
      Alert.alert('Продавця не видалено', outcome.message, [
        { text: 'Зрозуміло', style: 'cancel' },
        { text: 'Відкрити «Правила»', onPress: () => router.push(outcome.leadsTo) },
      ]);
      return;
    }
    Alert.alert(`Видалити «${merchant.name}»?`, outcome.message, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: () =>
          void change('remove', () => merchantsRepo.remove(merchant.id, new Date())).then((ok) => {
            if (ok) router.back();
          }),
      },
    ]);
  };

  const spellings = spellingRows(merchant);

  return (
    <Screen>
      <ScreenHeader title={merchant.name} subtitle="Продавець" back={() => router.back()} />
      {sweptMessage ? (
        <ThemedText type="small" themeColor="textPositive">
          {sweptMessage}
        </ThemedText>
      ) : null}

      <Card style={styles.card}>
        <Field label="Назва" value={shownName} onChangeText={setName} />
        {nameError ? (
          <ThemedText type="small" themeColor="textDanger">
            {nameError}
          </ThemedText>
        ) : null}
        {shownName !== merchant.name ? <Action title="Перейменувати" onPress={rename} /> : null}
      </Card>

      <SectionLabel count={spellings.length}>Написання</SectionLabel>
      <ListCard>
        {spellings.map((s, n) => (
          <ListRow key={s.id} last={n === spellings.length - 1} style={styles.row}>
            <ThemedText style={styles.spelling}>{s.spelling}</ThemedText>
            {/* With one написання left, removing it is not offered: the продавець is deleted instead. */}
            {s.removable ? (
              <RowAction
                title="Прибрати"
                onPress={() => void change('spelling-remove', () => merchantsRepo.removeSpelling(s.id, new Date()))}
              />
            ) : null}
          </ListRow>
        ))}
      </ListCard>
      <Card style={styles.card}>
        <Field
          label="Ще одне написання"
          value={added}
          onChangeText={setAdded}
          autoCapitalize="none"
          placeholder="напр. atb market"
        />
        {addedError ? (
          <ThemedText type="small" themeColor="textDanger">
            {addedError}
          </ThemedText>
        ) : null}
        {added.trim() !== '' ? <Action title="Додати написання" onPress={() => void addSpelling()} /> : null}
      </Card>

      <View style={styles.actions}>
        <Action
          variant="secondary"
          title="Транзакції"
          onPress={() => router.push(merchantTransactionsHref(merchant.id))}
        />
        {others.length > 0 ? (
          merging ? (
            <Card style={styles.card}>
              <Picker
                label="Обʼєднати з"
                rows={others}
                recentIds={[]}
                selected={undefined}
                onSelect={mergeInto}
                noun="merchants"
                expanded={mergeListOpen}
                onExpandedChange={setMergeListOpen}
              />
              <Action variant="secondary" title="Скасувати" onPress={() => setMerging(false)} />
            </Card>
          ) : (
            <Action variant="secondary" title="Обʼєднати з…" onPress={() => setMerging(true)} />
          )
        ) : null}
        <Action variant="destructive" title="Видалити" onPress={remove} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  spelling: { flex: 1 },
  actions: { gap: Spacing.two },
});
