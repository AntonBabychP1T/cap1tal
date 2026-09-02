import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Choices, Field, RowAction } from '@/components/form';
import {
  Banner,
  Card,
  ListCard,
  ListRow,
  Screen,
  ScreenHeader,
  SectionLabel,
} from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { accounts as accountsRepo, notifications as notificationsRepo } from '@/db/repos';
import { useClearAlertOnOpen } from '@/hooks/use-alerting';
import { useOnForeground } from '@/hooks/use-on-foreground';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { failureAlert } from '@/ui/failure-alert';
import { notificationAccess } from '@/platform/notification-access-device';
import { notificationCapture } from '@/platform/notification-capture-device';
import type { NotificationAccess } from '@/platform/notification-access';
import { accountChoiceLabel } from '@/ui/labels';
import { accountChoicesFor } from '@/ui/account-choices';
import {
  accessSection,
  ADD_APP_ACTION,
  addWatchedApp,
  appChoices,
  KNOWN_BANK_APPS,
  NOTIFICATIONS_EXPLANATION,
  removeConfirmation,
  removeWatchedApp,
  watchRows,
  type WatchChange,
} from '@/ui/notification-settings';

import { Spacing } from '@/constants/theme';

/**
 * «Сповіщення банків» — where the owner grants the app permission to read what other banks post,
 * and says which app's notifications land on which рахунок.
 *
 * Everything decided here is decided in `src/ui/notification-settings.ts`, where `verify` can
 * reach it: what each access answer offers, which apps and рахунки the pickers hold, and the
 * order a watch is written in — the capture layer first, the row only on `ok`. This file is the
 * wiring, plus the one thing that cannot be tested off a device: asking the device.
 */

export default function NotificationsScreen() {
  const router = useRouter();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({
        // Archived ones too: a watch mapped to a рахунок since archived still shows its name.
        accounts: accountsRepo.list(),
        watches: notificationsRepo.watches(),
      }),
      [],
    ),
  );

  const [access, setAccess] = useState<NotificationAccess>();
  /**
   * Which of the known bank apps this phone has. `'unknown'` until the device answers, and
   * `'unknown'` for good on a platform or a build that cannot look — an unanswered question keeps
   * the whole list on offer rather than emptying the picker.
   */
  const [installed, setInstalled] = useState<readonly string[] | 'unknown'>('unknown');
  const [adding, setAdding] = useState(false);
  const [packageName, setPackageName] = useState('');
  const [accountId, setAccountId] = useState<string>();
  const [answer, setAnswer] = useState<string>();

  /** The device's own answer, never a remembered one: a permission revoked outside the app. */
  const readAccess = useCallback(() => {
    void notificationAccess.state().then(setAccess);
  }, []);

  /**
   * And which of the known bank apps are installed. Asked on focus like the access is: an app
   * installed while this screen was elsewhere should be offered when the owner comes back.
   */
  const readInstalled = useCallback(() => {
    void notificationCapture
      .installedAmong(KNOWN_BANK_APPS.map((app) => app.packageName))
      .then(setInstalled);
  }, []);

  /** Opening the section asks the device. */
  useFocusEffect(readAccess);
  useFocusEffect(readInstalled);

  /**
   * And so does coming back to the app. Granting happens on Android's own «Доступ до сповіщень»
   * screen, which is another app: our screen never loses navigation focus while the owner is
   * there, so the focus effect alone would still be showing «не надано» when they return. The
   * transition that actually happens is the foreground one — the same signal the drain in
   * `_layout.tsx` runs on, and what design D3 means by "returning is a foreground transition".
   */
  useOnForeground(readAccess);

  /**
   * And opening the section clears the сповіщення that led here — the collection having stopped,
   * whether because it failed or because the access was withdrawn (design D5a, D6). The owner is
   * now looking at the state that caused it.
   */
  useClearAlertOnOpen('collection');

  const section = access ? accessSection(access) : undefined;
  const rows = useMemo(
    () => watchRows({ watches: stored.watches, accounts: stored.accounts }),
    [stored.accounts, stored.watches],
  );
  const apps = useMemo(
    () => appChoices({ watches: stored.watches, installed }),
    [installed, stored.watches],
  );
  // The same picker rule every other screen has: the unarchived рахунки, `account-choices.ts`.
  const offered = useMemo(
    () => accountChoicesFor(stored.accounts, undefined),
    [stored.accounts],
  );

  const settle = useCallback(
    (change: WatchChange) => {
      if (change.kind === 'stored') {
        setAdding(false);
        setPackageName('');
        setAccountId(undefined);
      }
      setAnswer(change.kind === 'removed' ? undefined : change.message);
      reload();
    },
    [reload],
  );

  const add = useCallback(
    async (chosen: string) => {
      if (!accountId) {
        setAnswer('Оберіть рахунок, на який лягатимуть транзакції.');
        return;
      }
      try {
        settle(
          await addWatchedApp(
            {
              packageName: chosen,
              accountId,
              watches: stored.watches,
              accounts: stored.accounts,
            },
            { capture: notificationCapture, storage: notificationsRepo },
          ),
        );
      } catch (error) {
        Alert.alert(
          ...failureAlert({ title: 'Не додано', where: 'watch-add', error, report: reportBug }),
        );
      }
    },
    [accountId, reportBug, settle, stored.accounts, stored.watches],
  );

  const remove = useCallback(
    (removed: string) => {
      // The same confirmed gesture deletion uses everywhere else in the app.
      Alert.alert('Сповіщення банків', removeConfirmation(removed), [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Не читати',
          style: 'destructive',
          onPress: () => {
            void removeWatchedApp(
              { packageName: removed, watches: stored.watches },
              { capture: notificationCapture, storage: notificationsRepo },
            )
              .then(settle)
              .catch((error: unknown) =>
                Alert.alert(
                  ...failureAlert({
                    title: 'Не змінено',
                    where: 'watch-remove',
                    error,
                    report: reportBug,
                  }),
                ),
              );
          },
        },
      ]);
    },
    [reportBug, settle, stored.watches],
  );

  return (
    <Screen>
      <ScreenHeader title="Сповіщення банків" back={() => router.back()} />

      <Card style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {section?.explanation ?? NOTIFICATIONS_EXPLANATION}
        </ThemedText>
        {section ? <ThemedText type="overline">{section.status}</ThemedText> : null}
        {/* Offered only where there is somewhere to go: an unsupported build lists no listener on
            Android's screen, so it gets no button rather than a dead one. */}
        {section?.grant ? (
          <Action
            title={section.grant}
            variant="secondary"
            onPress={() => {
              void notificationAccess.openSettings();
            }}
          />
        ) : null}
      </Card>

      {answer ? <Banner>{answer}</Banner> : null}

      {section?.manageable ? (
        <>
          <SectionLabel>Застосунки, які читаємо</SectionLabel>
          {rows.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Поки жодного. Додайте застосунок банку — і його сповіщення ставатимуть чернетками.
            </ThemedText>
          ) : (
            <ListCard>
              {rows.map((row, index) => (
                <ListRow key={row.packageName} last={index === rows.length - 1} style={styles.row}>
                  <View style={styles.rowTop}>
                    <View style={styles.rowLabel}>
                      <ThemedText numberOfLines={1}>{row.appName}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {row.accountName}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.rowActions}>
                    <RowAction title="Не читати" onPress={() => remove(row.packageName)} />
                  </View>
                </ListRow>
              ))}
            </ListCard>
          )}

          {adding ? (
            <Card style={styles.card}>
              <Choices
                label="Рахунок"
                choices={offered.map((a) => ({ value: a.id, label: accountChoiceLabel(a) }))}
                selected={accountId}
                onSelect={setAccountId}
              />
              {apps.length > 0 ? (
                <Choices
                  label="Банк"
                  choices={apps.map((app) => ({ value: app.packageName, label: app.name }))}
                  selected={undefined}
                  onSelect={(chosen: string) => {
                    void add(chosen);
                  }}
                />
              ) : null}
              <Field
                label="Або пакет застосунку"
                value={packageName}
                onChangeText={setPackageName}
                autoCapitalize="none"
                placeholder="ua.bank.app"
              />
              <Action
                title="Читати цей застосунок"
                onPress={() => {
                  void add(packageName);
                }}
              />
              <Action title="Скасувати" variant="secondary" onPress={() => setAdding(false)} />
            </Card>
          ) : (
            <Action title={ADD_APP_ACTION} onPress={() => setAdding(true)} />
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { gap: Spacing.two },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  rowLabel: { flex: 1, gap: Spacing.half },
  rowActions: { flexDirection: 'row' },
});
