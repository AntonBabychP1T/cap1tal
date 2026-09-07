import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { ConnectFailure } from '../backup/drive/connection';
import type { RestoreRefusal } from '../backup/drive/restore';
import type { BackupFailure } from '../backup/drive/run-backup';
import type { OfferedVersion } from '../backup/drive/run-restore';
import type { DriveBackupState } from '../backup/drive/state';
import {
  ANOTHER_LINE_MESSAGE,
  DISCONNECT_WARNING,
  DRIVE_EXPLANATION,
  DRIVE_SCOPE_PROMISE,
  FRESH_LINE_WARNING,
  MISTYPED_CODE_MESSAGE,
  RECOVERY_CODE_EXPLANATION,
  RESTORE_WARNING,
  backupFailureMessage,
  busyMessage,
  connectFailureMessage,
  existingVersionsExplanation,
  restoreConfirmation,
  restoreFailureMessage,
  restoreOutcomeMessage,
  restoreRefusalMessage,
  sectionState,
  versionRows,
} from './drive-backup';

/**
 * What the section says, held to the spec's requirements — in Ukrainian, naming a next step, and
 * never a secret. The mapping is walked exhaustively over every failure union in the change, which
 * is the point of design D13: an outcome name reaching a label is the defect this test exists for.
 */

const NOW = new Date('2026-09-07T09:00:00.000Z');
const YESTERDAY = new Date('2026-09-06T08:00:00.000Z');

const CONNECTED: DriveBackupState = {
  accountLabel: 'owner@example.com',
  recoveryCodeAcknowledgedAt: new Date('2026-09-01T08:00:00.000Z'),
};

/** Every member of every failure union this change can put on the screen. */
const BACKUP_FAILURES: readonly BackupFailure[] = [
  'no-network',
  'withdrawn',
  'full',
  'no-key',
  'unavailable',
];
const CONNECT_FAILURES: readonly ConnectFailure[] = [
  'refused',
  'no-network',
  'not-configured',
  'no-key',
  'unavailable',
  'key-already-held',
];

/**
 * Every reason a confirmed restore can fail — step 11's five refusals plus a throw. This is the
 * union the first draft of this test forgot to walk, which let a restore failure surface through
 * `backupFailureMessage`'s fallback: the wrong operation, and the wrong next step, at the most
 * dangerous moment in the app.
 */
const RESTORE_OUTCOMES: readonly string[] = [
  'not-a-backup',
  'damaged',
  'newer-format',
  'newer-schema',
  'inconsistent',
  'the replacement threw',
];
const RESTORE_REFUSALS: readonly RestoreRefusal[] = [
  { kind: 'not-an-envelope' },
  { kind: 'damaged' },
  { kind: 'newer-envelope', envelopeVersion: 2, supported: 1 },
  { kind: 'will-not-open' },
  { kind: 'another-line', keyId: 'a1b2c3d4e5f60718' },
  { kind: 'newer-schema', schemaVersion: 21, supported: 20 },
  { kind: 'unreadable-backup', why: 'damaged' },
];

/** Ukrainian, by the alphabet it is written in — a bare outcome name has none of these. */
function isUkrainian(sentence: string): boolean {
  return /[а-яїієґА-ЯЇІЄҐ]/.test(sentence);
}

describe('the section speaks Ukrainian and never shows a secret', () => {
  it('Scenario: A refusal is a Ukrainian sentence with a way out', () => {
    const everything = [
      ...BACKUP_FAILURES.map(backupFailureMessage),
      ...CONNECT_FAILURES.map(connectFailureMessage),
      ...RESTORE_REFUSALS.map(restoreRefusalMessage),
      ...(['no-network', 'withdrawn', 'unavailable', 'no-key'] as const).map(restoreFailureMessage),
      ...RESTORE_OUTCOMES.map(restoreOutcomeMessage),
      MISTYPED_CODE_MESSAGE,
      ANOTHER_LINE_MESSAGE,
    ];

    for (const sentence of everything) {
      expect(isUkrainian(sentence)).toBe(true);
      // A sentence, not a fragment: it ends, and it is long enough to have said something.
      expect(sentence.length).toBeGreaterThan(30);
      expect(sentence.trimEnd().endsWith('.')).toBe(true);
    }
  });

  it('no untranslated outcome name reaches a label', () => {
    const everything = [
      ...BACKUP_FAILURES.map(backupFailureMessage),
      ...CONNECT_FAILURES.map(connectFailureMessage),
      ...RESTORE_REFUSALS.map(restoreRefusalMessage),
      ...(['no-network', 'withdrawn', 'unavailable', 'no-key'] as const).map(restoreFailureMessage),
      ...RESTORE_OUTCOMES.map(restoreOutcomeMessage),
    ];

    // The names the engine uses, which the emulator smoke of `limits-goals-reports` once found on
    // a Ukrainian screen. None of them may appear in anything the owner reads.
    for (const identifier of [
      'no-network',
      'withdrawn',
      'not-configured',
      'no-key',
      'unavailable',
      'not-an-envelope',
      'will-not-open',
      'another-line',
      'newer-schema',
      'newer-envelope',
      'unreadable-backup',
      'storageQuotaExceeded',
      'appDataFolder',
      'not-a-backup',
      'newer-format',
      'inconsistent',
      'key-already-held',
    ]) {
      for (const sentence of everything) {
        expect(sentence).not.toContain(identifier);
      }
    }
  });

  it('every refusal names something the owner can do', () => {
    const everything = [
      ...BACKUP_FAILURES.map(backupFailureMessage),
      ...CONNECT_FAILURES.map(connectFailureMessage),
      ...RESTORE_REFUSALS.map(restoreRefusalMessage),
      ...RESTORE_OUTCOMES.map(restoreOutcomeMessage),
    ];

    // Either a next step for the owner, or the assurance that nothing was lost — the two things
    // that make a refusal actionable rather than merely reported.
    for (const sentence of everything) {
      const actionable =
        /[Сс]пробуйте|[Сс]пробує|[Пп]ідключіть|[Оо]новіть|[Оо]беріть|[Зз]вільніть|[Рр]озблокуйте|[Пп]еревірте|[Вв]ведіть|[Сс]користайтеся|недоступн/.test(
          sentence,
        ) || /нічого не змінилося|на місці|не подівся|все як було|залишилося як було/.test(sentence);
      expect({ sentence, actionable }).toEqual({ sentence, actionable: true });
    }
  });

  it('Scenario: A failed manual backup names its reason', () => {
    // «Зберегти зараз» with no network: the reason, and the assurance the last success still
    // stands — which is what `sectionState` puts beside it.
    expect(backupFailureMessage('no-network')).toContain('Не було мережі');
    const state = sectionState({
      state: {
        ...CONNECTED,
        lastSuccessAt: YESTERDAY,
        lastFailureKind: 'no-network',
        lastFailureAt: new Date('2026-09-07T08:30:00.000Z'),
      },
      now: NOW,
    });
    expect(state.kind === 'connected' && state.lastBackup).toContain('вчора');
    expect(state.kind === 'connected' && state.failure).toContain('Не було мережі');
  });

  it('an unknown stored failure is still a sentence, not an identifier', () => {
    // `last_failure_kind` is a column: a row written by a later build and then downgraded would
    // otherwise put a bare word on the screen.
    const message = backupFailureMessage('some-future-failure');

    expect(isUkrainian(message)).toBe(true);
    expect(message).not.toContain('some-future-failure');
  });

  it('Scenario: No token or authorisation is displayed', () => {
    const state = sectionState({
      state: { ...CONNECTED, lastSuccessAt: YESTERDAY, lastUploadedChecksum: 'deadbeef' },
      now: NOW,
    });

    // The section is built from a state that carries no token, no key and no code — and the one
    // stored value it does read, the checksum, is not shown either.
    const shown = JSON.stringify(state);
    expect(shown).not.toContain('deadbeef');
    expect(shown).toContain('owner@example.com');
  });
});

describe('where the section says the app stands', () => {
  it('Scenario: Not connected states what connecting does', () => {
    expect(sectionState({ state: {}, now: NOW })).toEqual({ kind: 'not-connected' });
    // What connecting does, and what it asks for — both said before the owner is sent to Google.
    expect(DRIVE_EXPLANATION).toContain('раз на добу');
    expect(DRIVE_EXPLANATION).toContain('Google Drive');
    expect(DRIVE_SCOPE_PROMISE).toContain('лише до власної прихованої теки');
  });

  it('Scenario: The section says how it differs from «Бекап»', () => {
    // Two sections about бекап sit side by side in Налаштування, one saying files are unencrypted
    // and the other that they are sealed. This is the sentence that keeps them apart.
    expect(DRIVE_EXPLANATION).toContain('«Бекапу»');
    expect(DRIVE_EXPLANATION).toContain('зашифровано');
  });

  it('Scenario: Connected shows the account and the last backup', () => {
    const state = sectionState({ state: { ...CONNECTED, lastSuccessAt: YESTERDAY }, now: NOW });

    expect(state).toMatchObject({ kind: 'connected', account: 'owner@example.com' });
    expect(state.kind === 'connected' && state.lastBackup).toContain('вчора');
    expect(state.kind === 'connected' && state.failure).toBeUndefined();
  });

  it('Scenario: Nothing uploaded yet is said plainly', () => {
    const state = sectionState({ state: CONNECTED, now: NOW });

    // No date at all, and no invented one.
    expect(state.kind === 'connected' && state.lastBackup).toBe(
      'Бекапу ще не було — перший піде, щойно застосунок отримає нагоду.',
    );
    expect(state.kind === 'connected' && state.lastBackup).not.toMatch(/\d\d:\d\d/);
  });

  it('Scenario: A failure is shown next to the last success', () => {
    const state = sectionState({
      state: {
        ...CONNECTED,
        lastSuccessAt: YESTERDAY,
        lastFailureKind: 'no-network',
        lastFailureAt: new Date('2026-09-07T08:00:00.000Z'),
      },
      now: NOW,
    });

    // Yesterday's success still stands…
    expect(state.kind === 'connected' && state.lastBackup).toContain('вчора');
    // …beside today's failure and its reason.
    expect(state.kind === 'connected' && state.failure).toContain('сьогодні');
    expect(state.kind === 'connected' && state.failure).toContain('Не було мережі');
  });

  it('Scenario: An unchanged бекап does not read as a stale one', () => {
    const fiveDaysAgo = new Date('2026-09-02T08:00:00.000Z');
    const stale = sectionState({
      state: { ...CONNECTED, lastSuccessAt: fiveDaysAgo },
      now: NOW,
      changed: false,
    });

    // An ageing date with nothing beside it reads like a silent failure by day three. This is what
    // says the copy in Drive is still the current one.
    expect(stale.kind === 'connected' && stale.stillCurrent).toContain('актуальна');
    expect(stale.kind === 'connected' && stale.failure).toBeUndefined();

    // And when something *has* changed, no such claim is made.
    const changed = sectionState({
      state: { ...CONNECTED, lastSuccessAt: fiveDaysAgo },
      now: NOW,
      changed: true,
    });
    expect(changed.kind === 'connected' && changed.stillCurrent).toBeUndefined();
  });
});

describe('«Відновити»', () => {
  it('Scenario: The list is offered by date', () => {
    const offered: readonly OfferedVersion[] = [
      { id: '2', name: 'b', createdAt: new Date('2026-09-06T08:00:00.000Z') },
      { id: '1', name: 'a', createdAt: new Date('2026-09-04T08:00:00.000Z') },
    ];

    const rows = versionRows(offered, NOW);

    // The order the run offered them in is kept — newest first is decided there, over the date in
    // each бекап's own head.
    expect(rows.map((row) => row.id)).toEqual(['2', '1']);
    expect(rows[0]?.made).toContain('вчора');
    expect(rows[0]?.refusal).toBeUndefined();
  });

  it('Scenario: A версія from another line is named as such', () => {
    const rows = versionRows(
      [
        {
          id: '1',
          name: 'a',
          createdAt: new Date('2026-09-04T08:00:00.000Z'),
          refusal: { kind: 'another-line', keyId: 'a1b2c3d4e5f60718' },
        },
      ],
      NOW,
    );

    // It is listed, with why it cannot be used — and the reason is not «you typed it wrong».
    expect(rows[0]?.refusal).toContain('іншого коду відновлення');
    expect(rows[0]?.refusal).not.toContain('неправильний');
    // And the key it names is never shown: a fingerprint on screen would mean nothing to anyone.
    expect(rows[0]?.refusal).not.toContain('a1b2c3d4e5f60718');
  });

  it('a версія whose date will not read says so rather than inventing one', () => {
    const rows = versionRows([{ id: '1', name: 'stranger.c1b' }], NOW);

    expect(rows[0]?.made).toBe('дата невідома');
  });

  it('Scenario: Confirmation is required and names what is replaced', () => {
    const confirmation = restoreConfirmation({
      made: new Date('2026-09-04T08:00:00.000Z'),
      backupTransactions: 812,
      phoneTransactions: 815,
      now: NOW,
    });

    // The date, both figures, and that everything now on the phone goes.
    expect(confirmation).toContain('4 вересня');
    expect(confirmation).toContain('812 транзакцій');
    expect(confirmation).toContain('815');
    expect(confirmation).toContain('замінює все, що зараз на телефоні');
  });

  it('counts транзакції in the three Ukrainian forms', () => {
    // The app's most consequential confirmation may not read «У ній 1 транзакцій».
    const of = (n: number) =>
      restoreConfirmation({ made: NOW, backupTransactions: n, phoneTransactions: 0, now: NOW });

    expect(of(1)).toContain('1 транзакція');
    expect(of(3)).toContain('3 транзакції');
    expect(of(5)).toContain('5 транзакцій');
    expect(of(11)).toContain('11 транзакцій');
  });

  it('Scenario: A wrong код відновлення is said plainly and can be retyped', () => {
    expect(MISTYPED_CODE_MESSAGE).toContain('ще раз');
    expect(MISTYPED_CODE_MESSAGE).toContain('нічого не змінено');
    // And a correct code for another folder is a different sentence.
    expect(ANOTHER_LINE_MESSAGE).not.toBe(MISTYPED_CODE_MESSAGE);
    expect(ANOTHER_LINE_MESSAGE).toContain('правильний');
  });
});

describe('what the owner is told before an irreversible step', () => {
  it('Scenario: The code is shown with what it is for', () => {
    expect(RECOVERY_CODE_EXPLANATION).toContain('новому телефоні');
    // That it cannot be recovered — the honesty the change trades for the owner's diligence.
    expect(RECOVERY_CODE_EXPLANATION).toContain('відновити код застосунок не може');
    expect(RECOVERY_CODE_EXPLANATION).toContain('Запишіть');
  });

  it('Scenario: Disconnecting is confirmed and explained first', () => {
    expect(DISCONNECT_WARNING).toContain('залишаться там');
    expect(DISCONNECT_WARNING).toContain('код відновлення далі їх відкриває');
  });

  it('Scenario: Starting afresh says what it costs first', () => {
    expect(FRESH_LINE_WARNING).toContain('більше не відкриє');
    expect(FRESH_LINE_WARNING).toContain('не видалить');
  });

  it('«Відновити» says it replaces rather than merges', () => {
    expect(RESTORE_WARNING).toContain('замінює все');
    expect(RESTORE_WARNING).toContain('не зливає');
  });
});

describe('the screen builds no label of its own', () => {
  it('every sentence the owner reads comes from this module', () => {
    // Read by path (rules/testing.md): a test may not live under `src/app/`. What it holds the
    // screen to is that no Ukrainian sentence is built inline — every one is imported from
    // `drive-backup.ts`, where `verify` can check it. Short labels on buttons are the deliberate
    // exception, and they are listed so adding a sentence has to come past this test.
    //
    // Comments are stripped first: this file explains itself in Ukrainian terms and those are not
    // strings the owner reads.
    const inlineUkrainian = [...codeOfScreen().matchAll(/["'`]([^"'`\n]*[а-яїієґА-ЯЇІЄҐ][^"'`\n]*)["'`]/g)]
      .map(([, text]) => (text ?? '').trim())
      .filter((text) => !ALLOWED_SHORT_LABELS.includes(text));

    expect(inlineUkrainian).toEqual([]);
  });

  it('Scenario: The owner can ask for it again — the button shows the code', () => {
    const screen = codeOfScreen();

    // The defect this asserts against: «Показати код відновлення» once opened the *type-a-code*
    // step, so the requirement had no implementation at all. It must reach `showRecoveryCode`.
    expect(screen).toContain('showRecoveryCode');
    expect(screen).toContain('onPress={doShowCode}');
    // And what it shows is a reading, not a step waiting on an acknowledgement.
    expect(screen).toContain('acknowledge: false');
  });

  it('the section is told whether anything has changed since the last бекап', () => {
    const screen = codeOfScreen();

    // Without this the `stillCurrent` sentence is unreachable on the real screen and an ageing
    // date reads as a silent failure — the function was proven against an input nothing supplied.
    expect(screen).toContain('shouldUpload');
    // And by the *shared* rule, not a second spelling of it: two definitions of what makes two
    // бекапи the same is two answers to «чи копія у Drive актуальна».
    expect(screen).toContain('checksumOf(');
    expect(screen).not.toContain('crc32(');
    // And the retry path keeps the door it was opened with — proven by what the branches do, not
    // by tolerating the fallback literal: rebuilding the door as zero made the section say «вже є
    // 0 версій бекапу» after one mistyped character, on the new-phone flow's retry path.
    expect(screen).toMatch(/const door: Step =\s*step\.kind === 'ask-code' \? step :/);
    for (const branch of ['mistyped', 'another-line', 'failed']) {
      expect(screen).toMatch(new RegExp(`case '${branch}':[\\s\\S]{0,120}?setStep\\(door\\);`));
    }
    expect(screen).toContain('lastUploadedChecksum: state.lastUploadedChecksum');
  });

  it('a running act says which act it is', () => {
    const screen = codeOfScreen();

    // A screen that blanks while busy says nothing is happening; «Зберегти зараз» must show it is
    // running, and a відновлення must say nothing has been replaced yet.
    expect(screen).toContain('busyMessage(step.doing)');
    expect(screen).toContain("doing: 'restoring'");
    // And a бекап is the only act called one: connecting, disconnecting, listing and showing the
    // code are not бекапи, and the busy line may not say they are.
    // Only the count of *entering* the state, so the union's own declaration is not counted.
    expect([...screen.matchAll(/busy', doing: 'saving'/g)]).toHaveLength(1);
  });

  it('the withdrawn state is actually rendered', () => {
    const screen = codeOfScreen();

    // A state built and never shown is a requirement with no implementation: the owner would find
    // the section back at its plain offer with no idea why.
    expect(screen).toContain("section.kind === 'withdrawn'");
    expect(screen).toContain('withdrawn.explanation');
  });

  it('a restore adopts a key only from the code that opened that версія', () => {
    const screen = codeOfScreen();

    // The bug this guards: reading the *field* let a stale code — typed for another line, then
    // abandoned via «Почати заново» — be adopted after restoring a версія the phone had opened
    // with its own key, silently orphaning the версія it had just uploaded.
    expect(screen).toContain('const code = step.openedWith;');
    expect(screen).not.toContain('const code = typed;');
    // The code is carried on the preview, and only when a code actually opened it.
    expect(screen).toContain('needsCode ? { openedWith: typed } : {}');
    // And the field is cleared wherever an attempt ends, so nothing stale survives a flow.
    expect([...screen.matchAll(/setTyped\(''\)/g)].length).toBeGreaterThanOrEqual(4);
  });

  it('the two irreversible actions are confirmed, not one-tap', () => {
    const screen = codeOfScreen();

    // «Почати заново» is irreversible from inside the app: once a key is held the code field is
    // never offered again, so a mistap would strand the phone away from every версія its old код
    // відновлення opens. «Відʼєднати» the requirement simply says must be confirmed.
    expect([...screen.matchAll(/Alert\.alert\('Google Drive'/g)]).toHaveLength(2);
    expect(screen).toContain("onPress: startFreshConfirmed");
    expect(screen).toContain("onPress: disconnectConfirmed");
    // And both dialogs say what it costs before the destructive choice.
    expect(screen).toContain("Alert.alert('Google Drive', FRESH_LINE_WARNING");
    expect(screen).toContain("Alert.alert('Google Drive', DISCONNECT_WARNING");
  });

  it('a failed відновлення is reported as one', () => {
    const screen = codeOfScreen();

    // Not `backupFailureMessage`, which would tell the owner about a бекап and send them to
    // «Зберегти зараз» at the most dangerous moment in the app.
    expect(screen).toContain('restoreOutcomeMessage');
  });

  it('Scenario: The code is not on the screen by default', () => {
    const screen = codeOfScreen();

    // The код відновлення reaches the screen only through a step a deliberate action produces —
    // connecting, starting afresh, or «Показати код відновлення» — and there is no path that
    // renders it as part of the section's ordinary body.
    expect(screen).toContain("step.kind === 'code'");
    // The one place the code itself is rendered is inside that step, and nowhere else.
    expect([...screen.matchAll(/\{step\.code\}/g)]).toHaveLength(1);
  });
});

/** The screen's source with its comments removed — what it actually shows, not how it explains itself. */
function codeOfScreen(): string {
  const source = readFileSync(new URL('../app/manage/drive-backup.tsx', import.meta.url), 'utf8');
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * The short labels the screen may write inline: button captions, headings and column names, none
 * of which is a sentence the spec puts words to. Anything longer belongs in `drive-backup.ts`.
 */
const ALLOWED_SHORT_LABELS: readonly string[] = [
  'Google Drive',
  'Підключити Google Drive',
  'Відʼєднати Google Drive',
  'Відʼєднати',
  'Зберегти зараз',
  'Відновити',
  'Скасувати',
  'Показати код відновлення',
  'Код відновлення',
  'Скопіювати',
  'Я записав код',
  'Почати заново',
  'Версії бекапу',
  'Продовжити',
  'Замінити все',
];

describe('a відновлення that did not land', () => {
  it('says it was a відновлення, and that the phone is as it was', () => {
    for (const why of RESTORE_OUTCOMES) {
      const said = restoreOutcomeMessage(why);

      // The right operation named — this is the moment the owner most needs to be told exactly
      // what happened and exactly what did not.
      expect(said).toContain('Відновлення не відбулося');
      // And the fact that matters more than the reason: nothing was replaced.
      expect(/все як було|залишилося як було/.test(said)).toBe(true);
      // Never «Спробуйте «Зберегти зараз»», which is the wrong next step for a restore.
      expect(said).not.toContain('Зберегти зараз');
    }
  });

  it('is not the same sentence as a failed бекап', () => {
    // The defect this function exists to fix: a restore failing through `backupFailureMessage`
    // told the owner about a бекап and sent them to «Зберегти зараз».
    expect(restoreOutcomeMessage('damaged')).not.toBe(backupFailureMessage('damaged'));
  });
});

describe('while an act is running', () => {
  it('says which act it is', () => {
    // A screen that blanks says nothing is happening. «Зберегти зараз» must show that it is
    // running, and a відновлення must say nothing has been replaced yet.
    expect(busyMessage('saving')).toContain('Бекап іде');
    expect(busyMessage('restoring')).toContain('Відновлення триває');
    expect(busyMessage('restoring')).toContain('Нічого не буде замінено');
    // Five of the section's six actions are not бекапи, and «Бекап іде» in front of a disconnect
    // would simply be wrong.
    expect(busyMessage('connecting')).not.toContain('Бекап');
    expect(busyMessage('connecting')).not.toContain('Відновлення');
  });
});

describe('the ask-code door', () => {
  it('Scenario: A new phone is offered the existing line', () => {
    const said = existingVersionsExplanation(3);

    // It says what is there, what typing the code does, and that the connection completes at once
    // — none of which the starting-afresh warning says, and that warning was what it used to show.
    expect(said).toContain('3 версії');
    expect(said).toContain('продовжить ту саму лінію');
    expect(said).toContain('і є підтвердженням');
    expect(said).not.toBe(FRESH_LINE_WARNING);
  });

  it('counts версії in the three Ukrainian forms', () => {
    expect(existingVersionsExplanation(1)).toContain('1 версія');
    expect(existingVersionsExplanation(2)).toContain('2 версії');
    expect(existingVersionsExplanation(5)).toContain('5 версій');
    expect(existingVersionsExplanation(11)).toContain('11 версій');
    expect(existingVersionsExplanation(21)).toContain('21 версія');
  });
});

describe('when Google has withdrawn the app’s access', () => {
  it('Scenario: Withdrawn access stops the claim of being connected', () => {
    // The state `recordWithdrawn` leaves behind: an account, a withdrawal, and no acknowledgement.
    const state = sectionState({
      state: {
        accountLabel: 'owner@example.com',
        lastFailureKind: 'withdrawn',
        lastFailureAt: new Date('2026-09-07T08:00:00.000Z'),
        lastSuccessAt: YESTERDAY,
      },
      now: NOW,
    });

    // Not connected — and not a blank offer either: the owner is told why the section changed
    // under them, and that nothing of theirs was lost.
    expect(state.kind).toBe('withdrawn');
    expect(state.kind === 'withdrawn' && state.explanation).toContain('Підключіть Google Drive знову');
    expect(state.kind === 'withdrawn' && state.explanation).toContain('недоторкані');
    expect(state.kind === 'withdrawn' && state.account).toBe('owner@example.com');
  });

  it('a phone that simply never connected is the plain offer', () => {
    expect(sectionState({ state: {}, now: NOW })).toEqual({ kind: 'not-connected' });
    // And a disconnect, which clears the row entirely, is the same plain offer.
    expect(sectionState({ state: { lastFailureKind: 'withdrawn' }, now: NOW })).toEqual({
      kind: 'not-connected',
    });
  });
});
