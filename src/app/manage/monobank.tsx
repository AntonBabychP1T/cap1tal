import * as Clipboard from 'expo-clipboard';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
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
import type { AcceptedLink } from '@/db/monobank-repo';
import { accounts as accountsRepo, monobank as monobankRepo, rules as rulesRepo } from '@/db/repos';
import { account, type AccountKind } from '@/domain/account';
import { monobankConnection, type ConnectionResult } from '@/monobank/connection';
import { suggestLinks } from '@/monobank/link';
import { syncLinkedAccounts, type SyncProgress, type SyncRun } from '@/monobank/coordinator';
import { monobankTokenStore } from '@/platform/monobank-token-store';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { ALERT_PORTS, attended, useClearAlertOnOpen } from '@/hooks/use-alerting';
import { clear as clearAlert, raise as raiseAlert } from '@/ui/alerting';
import { dateOfEpochMs, todayIso } from '@/ui/dates';
import { newId } from '@/ui/id';
import { failureMessage, KIND_CHOICES } from '@/ui/labels';
import {
  boundaryConfirmation,
  CLIPBOARD_NO_TOKEN,
  linkChoiceLabel,
  linkChoices,
  linkSetConfirmation,
  MONOBANK_TOKEN_PAGE_URL,
  lastSyncLine,
  monobankAccountRows,
  newAccountDraft,
  outcomeLabel,
  progressLabel,
  proposalRows,
  removeTokenConfirmation,
  syncBoundary,
  syncFailed,
  syncSummary,
  tokenCandidate,
  tokenStateLabel,
  unlinkConfirmation,
  type MonobankAccountView,
} from '@/ui/monobank-screen';

import { Spacing } from '@/constants/theme';

/**
 * «monobank» — the one place the owner connects the bank, decides where each card and банка
 * belongs, and runs a sync.
 *
 * Every decision this screen displays belongs somewhere `verify` can reach: what the rows say and
 * what a link may be is `src/ui/monobank-screen.ts`, what happens to a token is
 * `src/monobank/connection.ts`, what a run does is `src/monobank/coordinator.ts`, and what
 * survives a restart is `src/db/monobank-repo.ts`. This file is the wiring.
 *
 * The token is here for exactly as long as it takes to validate it. It lives in one controlled
 * input, goes to the validation call, and the input is cleared the moment it is kept — after
 * that the screen knows only that monobank is configured, never what with.
 */

/** The device's own network and clock, injected into everything below rather than reached for. */
const connection = monobankConnection({
  tokenStore: monobankTokenStore,
  fetch: (url, headers) => fetch(url, { headers }),
  cacheAccounts: (fetched, obtainedAt) => monobankRepo.upsertAccounts(fetched, obtainedAt),
  now: () => new Date(),
});

/** A рахунок being created for a monobank account, before the owner has confirmed it. */
interface Draft {
  readonly monobankAccountId: string;
  name: string;
  kind: AccountKind;
  currency: string;
}

export default function MonobankScreen() {
  const router = useRouter();
  const [stored, reload] = useReloadOnFocus(
    useCallback(
      () => ({
        accounts: accountsRepo.list(),
        monobankAccounts: monobankRepo.listAccounts(),
        links: monobankRepo.listLinks(),
      }),
      [],
    ),
  );

  /** What monobank itself last said, when it has said anything this session. */
  const [fetched, setFetched] = useState<readonly MonobankAccountView[]>();
  const [configured, setConfigured] = useState<boolean>();
  const [candidate, setCandidate] = useState('');
  const [entering, setEntering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [run, setRun] = useState<SyncRun>();
  /** Set while a run is going on; the coordinator asks it before every request. */
  const cancelled = useRef(false);

  // The cached rows are what the screen opens on, so an offline opening is still useful; a
  // successful client-info answer replaces them for as long as the screen is open.
  const shown = fetched ?? stored.monobankAccounts;
  const rows = useMemo(
    () =>
      monobankAccountRows({
        monobankAccounts: shown,
        links: stored.links,
        accounts: stored.accounts,
        // «сьогодні» and «вчора» are read against the moment the screen is drawn, like every other
        // clock in this app — passed in, never read inside the rule.
        now: new Date(),
      }),
    [shown, stored.accounts, stored.links],
  );
  /** The most recent moment among the linked accounts, or that there has not been one. */
  const lastSync = useMemo(
    () => lastSyncLine({ links: stored.links, now: new Date() }),
    [stored.links],
  );
  const names = useMemo(
    () => new Map(rows.map((row) => [row.monobankAccountId, row.name])),
    [rows],
  );
  const summary = useMemo(() => (run ? syncSummary(run, names) : undefined), [names, run]);

  const [linking, setLinking] = useState<string>();
  const [draft, setDraft] = useState<Draft>();
  /**
   * The inclusive first day sync may import, for the account being linked. It starts at today —
   * the safe answer, importing nothing the owner already has — and is theirs to move back to
   * wherever their Saldo history ends. Every link path uses it, because every one makes a
   * boundary — the reviewed set included.
   */
  const [boundary, setBoundary] = useState(() => todayIso(new Date()));
  /** The proposals the owner has waved off this session. Refusing one writes nothing anywhere. */
  const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set<string>());

  /**
   * What the app would propose for every monobank account no link feeds yet, and the lines the
   * review list shows for them. Recomputed from what is on screen and what is stored — a
   * proposal is never remembered, so accepting one and reloading simply leaves one proposal
   * fewer.
   */
  const proposals = useMemo(
    () =>
      proposalRows({
        proposals: suggestLinks({
          monobankAccounts: shown,
          accounts: stored.accounts,
          links: stored.links,
        }),
        monobankAccounts: shown,
        accounts: stored.accounts,
      }),
    [shown, stored.accounts, stored.links],
  );
  const accepted = useMemo(
    () => proposals.filter((row) => row.acceptable && !refused.has(row.monobankAccountId)),
    [proposals, refused],
  );

  const toggleRefused = useCallback((monobankAccountId: string) => {
    setRefused((current) => {
      const next = new Set(current);
      if (next.has(monobankAccountId)) {
        next.delete(monobankAccountId);
      } else {
        next.add(monobankAccountId);
      }
      return next;
    });
  }, []);

  /** The one place a connection answer becomes what the owner reads. */
  const applyResult = useCallback((result: ConnectionResult | { kind: 'not-configured' }) => {
    switch (result.kind) {
      case 'configured':
        setFetched(result.accounts);
        setConfigured(true);
        setStatus(result.cached ? undefined : 'Показано щойно отримане; зберегти його не вдалося.');
        return true;
      case 'invalid-token':
        setStatus('Токен не дійсний. Введіть новий — старий лишається, доки новий не пройде.');
        return false;
      case 'rate-limited':
        setStatus('Банк просить зачекати. Спробуйте за хвилину.');
        return false;
      case 'not-configured':
        setConfigured(false);
        setStatus(undefined);
        return false;
      case 'storage-unavailable':
        setStatus('Сховище токена недоступне на цьому пристрої.');
        return false;
      default:
        setStatus('monobank недоступний. Показано те, що збережено раніше.');
        return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const state = await connection.state();
      setConfigured(state.kind === 'configured');
      if (state.kind !== 'configured') {
        applyResult(state.kind === 'not-configured' ? { kind: 'not-configured' } : state);
        return;
      }
      applyResult(await connection.refresh());
      reload();
    } finally {
      setBusy(false);
    }
  }, [applyResult, reload]);

  /** The one path a token takes to the bank, wherever the owner got it from. */
  const submitToken = useCallback(
    async (value: string) => {
      setBusy(true);
      try {
        const result = await connection.submit(value);
        if (applyResult(result)) {
          // Kept — so the candidate leaves the screen's state entirely.
          setCandidate('');
          setEntering(false);
          setStatus('Токен збережено на пристрої.');
          reload();
        }
      } finally {
        setBusy(false);
      }
    },
    [applyResult, reload],
  );

  const submit = useCallback(async () => {
    const typed = candidate.trim();
    if (typed === '') {
      Alert.alert('Не збережено', 'Вставте токен із monobank API');
      return;
    }
    await submitToken(typed);
  }, [candidate, submitToken]);

  /**
   * The whole of "get a token": monobank's own page opens in the in-app browser, and closing it
   * is the owner's action that lets the app look at the clipboard — once. A token-shaped value
   * goes straight to the bank for validation, so the owner types nothing at all; anything else is
   * dropped without leaving the device and the field opens empty.
   *
   * This dismissal and the paste below are the only two clipboard reads in the app.
   */
  const getToken = useCallback(async () => {
    await WebBrowser.openBrowserAsync(MONOBANK_TOKEN_PAGE_URL);
    const copied = tokenCandidate(await Clipboard.getStringAsync());
    if (copied) {
      await submitToken(copied);
      return;
    }
    setEntering(true);
    setStatus(CLIPBOARD_NO_TOKEN);
  }, [submitToken]);

  /** The same read, asked for by hand while the field is open. */
  const pasteToken = useCallback(async () => {
    const copied = tokenCandidate(await Clipboard.getStringAsync());
    if (!copied) {
      setStatus(CLIPBOARD_NO_TOKEN);
      return;
    }
    setCandidate(copied);
    setStatus(undefined);
  }, []);

  const removeToken = useCallback(() => {
    Alert.alert('monobank', removeTokenConfirmation(), [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          const removed = await connection.remove();
          if (removed.kind === 'ok') {
            setConfigured(false);
            setFetched(undefined);
            setStatus('Токен видалено. Рахунки й транзакції лишилися.');
          } else {
            setStatus('Сховище токена недоступне на цьому пристрої.');
          }
        },
      },
    ]);
  }, []);

  const linkExisting = useCallback(
    (monobankAccountId: string, accountId: string, date: string) => {
      try {
        monobankRepo.link({
          monobankAccountId,
          accountId,
          ...syncBoundary(date),
        });
        setLinking(undefined);
        reload();
      } catch (error) {
        Alert.alert('Не приєднано', failureMessage(error));
      }
    },
    [reload],
  );

  /** The owner confirms the boundary before the link exists; declining leaves nothing behind. */
  const confirmBoundary = useCallback((accountName: string, date: string, link: () => void) => {
    Alert.alert('Синхронізація', boundaryConfirmation(date, accountName), [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Приєднати', onPress: link },
    ]);
  }, []);

  const createAndLink = useCallback(() => {
    if (!draft) return;
    try {
      if (draft.name.trim() === '') {
        throw new Error('рахунок потребує назви');
      }
      const created = account({
        id: newId(),
        name: draft.name.trim(),
        kind: draft.kind,
        currency: draft.currency,
      });
      monobankRepo.createAccountAndLink({
        account: created,
        monobankAccountId: draft.monobankAccountId,
        ...syncBoundary(boundary),
      });
      setDraft(undefined);
      setLinking(undefined);
      reload();
    } catch (error) {
      Alert.alert('Не приєднано', failureMessage(error));
    }
  }, [boundary, draft, reload]);

  /**
   * The whole reviewed set, accepted at once: every proposal still standing becomes a link, and
   * every proposal that promised a new рахунок makes one — inside a single database transaction,
   * so a refusal anywhere leaves the device exactly as it was rather than half-linked.
   */
  const applyProposals = useCallback(() => {
    const entries = accepted.flatMap((row): AcceptedLink[] => {
      if (row.accountId) {
        return [
          {
            kind: 'existing' as const,
            monobankAccountId: row.monobankAccountId,
            accountId: row.accountId,
          },
        ];
      }
      if (!row.draft) {
        return [];
      }
      return [
        {
          kind: 'new' as const,
          monobankAccountId: row.monobankAccountId,
          account: account({
            id: newId(),
            name: row.draft.name,
            kind: row.draft.kind,
            currency: row.draft.currency,
          }),
        },
      ];
    });
    if (entries.length === 0) {
      return;
    }
    Alert.alert('Синхронізація', linkSetConfirmation(entries.length, boundary), [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Приєднати',
        onPress: () => {
          try {
            monobankRepo.linkMany({
              accepted: entries,
              ...syncBoundary(boundary),
            });
            reload();
          } catch (error) {
            Alert.alert('Не приєднано', failureMessage(error));
          }
        },
      },
    ]);
  }, [accepted, boundary, reload]);

  const unlink = useCallback(
    (monobankAccountId: string, name: string) => {
      Alert.alert('monobank', unlinkConfirmation(name), [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Відʼєднати',
          style: 'destructive',
          onPress: () => {
            monobankRepo.unlink(monobankAccountId);
            reload();
          },
        },
      ]);
    },
    [reload],
  );

  const sync = useCallback(async () => {
    cancelled.current = false;
    setBusy(true);
    setRun(undefined);
    setStatus('Синхронізація почалася.');
    try {
      const result = await syncLinkedAccounts({
        tokenStore: monobankTokenStore,
        fetch: (url, headers) => fetch(url, { headers }),
        storage: monobankRepo,
        rules: () => rulesRepo.list(),
        nowMs: () => Date.now(),
        now: () => new Date(),
        // The statement's own seconds turned into the day the money moved. `dateOfEpochMs` is
        // shared with the notification drain, so the two importers date a purchase alike.
        dateOf: (unixSeconds) => dateOfEpochMs(unixSeconds * 1000),
        wait: (ms) =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
          }),
        newId,
        onProgress: (event: SyncProgress) => setStatus(progressLabel(event, names)),
        cancelled: () => cancelled.current,
      });
      setRun(result);
      setStatus(undefined);
      reload();
      // A sync outlives the owner's patience for watching it — a minute per request — so this is
      // the failure they are least likely to be looking at. `attended()` is read now rather than
      // when the run started, because leaving the app mid-sync is the whole case.
      await (syncFailed(result)
        ? raiseAlert('monobank-sync', { attended: attended() }, ALERT_PORTS)
        : clearAlert('monobank-sync', ALERT_PORTS));
    } finally {
      setBusy(false);
    }
  }, [names, reload]);

  /**
   * Opening the route reads the connection state and, when a token is kept, asks monobank once
   * (design D6). The cached accounts are already on screen by then, so an offline opening still
   * shows the inventory whole and only the banner says it is stale. Without a token nothing goes
   * out at all — `connection.state()` reads secure storage and stops there.
   *
   * On focus rather than on mount, like every other read in this app: coming back to the screen is
   * opening it again. One client-info request per opening is what the bank's one-a-minute budget
   * affords, and it is the request the owner came here to see the answer of.
   */
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  /** Opening «monobank» is the owner looking at the failure this section explains (design D6). */
  useClearAlertOnOpen('monobank-sync');

  return (
    <Screen>
      <ScreenHeader title="monobank" back={() => router.back()} />

      <Card style={styles.card}>
        <ThemedText type="overline">{tokenStateLabel(configured)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Токен зберігається лише в захищеному сховищі телефона: він не потрапляє ні в базу, ні в
          резервні копії, і показати його вдруге неможливо.
        </ThemedText>
        {/* What the last request to the bank came back with — a fact about the connection, so it
            sits on the quiet banner rather than reading as another line of the paragraph. */}
        {status ? <Banner>{status}</Banner> : null}

        {entering ? (
          <>
            <Field
              label="Токен monobank"
              value={candidate}
              onChangeText={setCandidate}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="з api.monobank.ua"
            />
            <Action
              title={busy ? 'Перевіряємо…' : 'Перевірити і зберегти'}
              onPress={submit}
              disabled={busy}
            />
            <Action variant="secondary" title="Вставити з буфера" onPress={pasteToken} />
            <Action
              variant="secondary"
              title="Скасувати"
              onPress={() => {
                setCandidate('');
                setEntering(false);
              }}
            />
          </>
        ) : (
          <>
            {/* The road to a token, in the order it is walked: open the bank's own page, come
                back, and the app takes it from the clipboard itself. Typing it by hand stays
                available underneath for whoever already has one. */}
            <Action
              variant={configured ? 'secondary' : 'primary'}
              title={busy ? 'Перевіряємо…' : configured ? 'Замінити токен' : 'Отримати токен'}
              onPress={() => void getToken()}
              disabled={busy}
            />
            <ThemedText type="small" themeColor="textMuted">
              Відкриється сторінка api.monobank.ua: відскануйте QR у застосунку монобанку і
              скопіюйте токен. Повернувшись, застосунок підставить його з буфера сам.
            </ThemedText>
            <Action
              variant="secondary"
              title="Ввести токен вручну"
              onPress={() => setEntering(true)}
            />
            <Action
              variant="secondary"
              title={busy ? 'Оновлюємо…' : 'Оновити з monobank'}
              onPress={refresh}
              disabled={busy}
            />
            {configured ? (
              <Action variant="destructive" title="Видалити токен" onPress={removeToken} />
            ) : null}
          </>
        )}
      </Card>

      {proposals.length > 0 ? (
        <>
          <SectionLabel>Пропозиції приєднання</SectionLabel>
          <Card style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              Застосунок звірив назви й пропонує, куди приєднати кожну картку та банку. Нічого не
              записується, доки ви не підтвердите.
            </ThemedText>
            {/* One boundary for the whole set, chosen before it is accepted — the same date the
                per-account path uses, and the same promise about what is not imported. */}
            <Field
              label="Синхронізувати з"
              value={boundary}
              onChangeText={setBoundary}
              autoCapitalize="none"
              placeholder="РРРР-ММ-ДД"
              hint="включно; раніші записи не імпортуються"
            />
            <ListCard>
              {proposals.map((row, index) => {
                const skipped = refused.has(row.monobankAccountId);
                return (
                  <ListRow
                    key={row.monobankAccountId}
                    last={index === proposals.length - 1}
                    style={styles.bankRow}
                  >
                    <ThemedText numberOfLines={1}>{row.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {skipped ? '→ не приєднувати' : `${row.becomes} · ${row.reason}`}
                    </ThemedText>
                    <View style={styles.rowActions}>
                      {row.acceptable ? (
                        <RowAction
                          title={skipped ? 'Повернути' : 'Пропустити'}
                          onPress={() => toggleRefused(row.monobankAccountId)}
                        />
                      ) : (
                        <ThemedText type="small" themeColor="textMuted">
                          оберіть у списку нижче
                        </ThemedText>
                      )}
                    </View>
                  </ListRow>
                );
              })}
            </ListCard>
            <Action
              title={`Приєднати все (${accepted.length})`}
              onPress={applyProposals}
              disabled={accepted.length === 0}
            />
          </Card>
        </>
      ) : null}

      <SectionLabel>Рахунки monobank</SectionLabel>
      {rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Поки нічого не отримано. Введіть токен і оновіть.
        </ThemedText>
      ) : (
        <ListCard>
          {rows.map((row, index) => {
            const monobankAccount = shown.find((a) => a.id === row.monobankAccountId);
            const offered = monobankAccount
              ? linkChoices({
                  monobankAccount,
                  accounts: stored.accounts,
                  links: stored.links,
                })
              : [];
            return (
              <ListRow
                key={row.monobankAccountId}
                last={index === rows.length - 1}
                style={styles.bankRow}
              >
                <View style={styles.rowTop}>
                  <ThemedText numberOfLines={1} style={styles.bankName}>
                    {row.name}
                  </ThemedText>
                  <ThemedText tabular style={styles.amount}>
                    {row.bankBalance}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {row.kind === 'jar' ? 'банка' : 'картка'} ·{' '}
                  {row.linked
                    ? `приєднано до «${row.accountName}»${row.syncStartDate ? `, з ${row.syncStartDate}` : ''}`
                    : 'не приєднано — у синхронізації не бере участі'}
                </ThemedText>
                {/* When a sync last completed for this account, or plainly that none has. */}
                {row.lastSync ? (
                  <ThemedText type="small" themeColor="textMuted">
                    {row.lastSync}
                  </ThemedText>
                ) : null}

                <View style={styles.rowActions}>
                  {row.linked ? (
                    <RowAction
                      tone="danger"
                      title="Відʼєднати"
                      onPress={() => unlink(row.monobankAccountId, row.name)}
                    />
                  ) : (
                    <RowAction
                      title={linking === row.monobankAccountId ? 'Згорнути' : 'Приєднати'}
                      onPress={() => {
                        setLinking(
                          linking === row.monobankAccountId ? undefined : row.monobankAccountId,
                        );
                        setDraft(undefined);
                      }}
                    />
                  )}
                </View>

                {linking === row.monobankAccountId && monobankAccount ? (
                  <>
                    {/* The boundary is chosen before either link path is taken, because both make
                        one: today imports nothing the owner already has, and moving it back is
                        how they meet the end of their Saldo history. */}
                    <Field
                      label="Синхронізувати з"
                      value={boundary}
                      onChangeText={setBoundary}
                      autoCapitalize="none"
                      placeholder="РРРР-ММ-ДД"
                      hint="включно; раніші записи не імпортуються"
                    />
                    <Choices
                      label={`Наявний рахунок у ${row.currency}`}
                      choices={offered.map((a) => ({ value: a.id, label: linkChoiceLabel(a) }))}
                      selected={undefined}
                      onSelect={(accountId: string) =>
                        confirmBoundary(row.name, boundary, () =>
                          linkExisting(row.monobankAccountId, accountId, boundary),
                        )
                      }
                    />
                    {draft?.monobankAccountId === row.monobankAccountId ? (
                      <>
                        <Field
                          label="Назва"
                          value={draft.name}
                          onChangeText={(name) => setDraft({ ...draft, name })}
                        />
                        <Choices
                          label="Вид"
                          choices={KIND_CHOICES}
                          selected={draft.kind}
                          onSelect={(kind) => setDraft({ ...draft, kind })}
                        />
                        <ThemedText type="small" themeColor="textSecondary">
                          Валюта нового рахунку — {draft.currency}; приєднати можна лише рахунок
                          тієї самої валюти.
                        </ThemedText>
                        <Action
                          title="Створити і приєднати"
                          onPress={() => confirmBoundary(draft.name, boundary, createAndLink)}
                        />
                        <Action
                          variant="secondary"
                          title="Скасувати"
                          onPress={() => setDraft(undefined)}
                        />
                      </>
                    ) : (
                      <Action
                        variant="secondary"
                        title="Створити новий рахунок"
                        onPress={() =>
                          setDraft({
                            monobankAccountId: row.monobankAccountId,
                            ...newAccountDraft(monobankAccount),
                          })
                        }
                      />
                    )}
                  </>
                ) : null}
              </ListRow>
            );
          })}
        </ListCard>
      )}

      <SectionLabel>Синхронізація</SectionLabel>
      <Card style={styles.card}>
        {/* When this device last finished one. Said before the result of the run just made, so the
            screen answers «коли востаннє» whether or not anything was synced this session. Sync
            itself stays something the owner starts. */}
        {lastSync ? (
          <ThemedText type="small" themeColor="textSecondary">
            {lastSync}
          </ThemedText>
        ) : null}
        {summary ? (
          <>
            <ThemedText>{summary.headline}</ThemedText>
            {summary.accounts.map((line) => (
              <ThemedText key={line.monobankAccountId} type="small" themeColor="textSecondary">
                {line.text}
              </ThemedText>
            ))}
            {summary.replaceTokenOffered ? (
              <Action
                variant="secondary"
                title="Замінити токен"
                onPress={() => setEntering(true)}
              />
            ) : null}
            {summary.retryOffered ? (
              <Action variant="secondary" title="Повторити незавершене" onPress={sync} />
            ) : null}
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {stored.links.length === 0
              ? 'Приєднайте хоча б один рахунок, щоб синхронізувати.'
              : `Приєднано рахунків: ${stored.links.length}. Банк дозволяє один запит на хвилину, тож перша синхронізація може тривати.`}
          </ThemedText>
        )}
        {busy ? (
          <Action
            variant="destructive"
            title="Зупинити"
            onPress={() => {
              cancelled.current = true;
            }}
          />
        ) : (
          // One accent fill per screen: without a token the screen's action is entering one, and
          // syncing without it would do nothing anyway.
          <Action
            variant={configured && accepted.length === 0 ? 'primary' : 'secondary'}
            title="Синхронізувати"
            onPress={sync}
          />
        )}
      </Card>

      {/* The four outcomes named once, so the result lines above read without guessing. */}
      <ThemedText type="small" themeColor="textMuted">
        Можливі стани рахунку: {outcomeLabel('complete')}, {outcomeLabel('invalid-token')},{' '}
        {outcomeLabel('rate-limited')}, {outcomeLabel('unavailable')}.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  bankRow: { gap: Spacing.two },
  bankName: { flex: 1 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowActions: { flexDirection: 'row' },
  amount: { fontWeight: 600 },
});
