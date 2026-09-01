import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { isoDate } from '../domain/transaction';
import { accountsRepo } from '../db/accounts-repo';
import { notificationsRepo, type NotificationsRepo } from '../db/notifications-repo';
import { openTestDb, type TestStorage } from '../db/test-db';
import type { Draft, Watch } from '../notifications/draft';
import {
  inMemoryNotificationAccess,
  type NotificationAccess,
  type NotificationAccessPort,
} from '../platform/notification-access';
import {
  inMemoryNotificationCapture,
  MONOBANK_PACKAGE_PREFIX,
} from '../platform/notification-capture';
import { accountChoicesFor } from './account-choices';
import {
  accessSection,
  addWatchedApp,
  appChoices,
  KNOWN_BANK_APPS,
  removeConfirmation,
  removeWatchedApp,
  watchRows,
} from './notification-settings';

const card = account({ id: 'card', name: 'Приват', kind: 'spending', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'USD картка', kind: 'spending', currency: 'USD' });
const closed = account({
  id: 'closed',
  name: 'Закрита картка',
  kind: 'spending',
  currency: 'UAH',
  archived: true,
});

const PRIVAT = 'ua.privatbank.ap24';

/**
 * The device as it behaves across a grant: it answers `denied` until the owner has been to the
 * system screen, and `granted` once they have. Nothing else in the app can change that answer,
 * which is exactly why the section re-reads it rather than remembering one.
 */
function accessAcrossGranting(): NotificationAccessPort & { readonly opened: () => number } {
  let opened = 0;
  return {
    state: () => Promise.resolve<NotificationAccess>(opened > 0 ? 'granted' : 'denied'),
    openSettings: () => {
      opened += 1;
      return Promise.resolve();
    },
    opened: () => opened,
  };
}

describe('the «Сповіщення банків» access state', () => {
  it('Scenario: Granting flips the section to granted', async () => {
    const access = accessAcrossGranting();

    const before = accessSection(await access.state());
    expect(before.access).toBe('denied');
    // Denied offers the system screen, and nothing to manage yet.
    expect(before.grant).toBeDefined();
    expect(before.manageable).toBe(false);

    await access.openSettings();
    const after = accessSection(await access.state());

    expect(after.access).toBe('granted');
    expect(after.manageable).toBe(true);
  });

  it('Scenario: An unsupported build offers nowhere to go', async () => {
    const access = inMemoryNotificationAccess('unsupported');

    const section = accessSection(await access.state());

    expect(section.status).toContain('недоступне');
    // No offer at all: the app is not on Android's screen in this build, so sending the owner
    // there would send them looking for a switch that is not there.
    expect(section.grant).toBeUndefined();
    expect(section.manageable).toBe(false);
    expect(access.opened()).toBe(0);
  });

  it('Scenario: Revoked access is reported as denied again', async () => {
    // Granted once, then switched off in the system settings: reopening reads the device, not a
    // remembered answer.
    const revoked = accessSection(await inMemoryNotificationAccess('denied').state());

    expect(revoked.access).toBe('denied');
    expect(revoked.grant).toBeDefined();
    expect(revoked.manageable).toBe(false);
  });

  it('Every wording keeps the promise the permission raises', () => {
    for (const access of ['granted', 'denied', 'unsupported'] as const) {
      expect(accessSection(access).explanation).toContain('не залишає пристрій');
      expect(accessSection(access).explanation).toContain('чернетками');
    }
  });
});

describe('watched apps', () => {
  let storage: TestStorage;
  let repo: NotificationsRepo;

  const accounts = [card, dollars, closed];

  beforeEach(() => {
    storage = openTestDb();
    accountsRepo(storage.db).save(card);
    accountsRepo(storage.db).save(dollars);
    accountsRepo(storage.db).save(closed);
    repo = notificationsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A watched app appears with its рахунок', async () => {
    const capture = inMemoryNotificationCapture();

    const change = await addWatchedApp(
      { packageName: PRIVAT, accountId: 'card', watches: repo.watches(), accounts },
      { capture, storage: repo },
    );

    expect(change.kind).toBe('stored');
    // The device was told the new watched set, and the row followed it.
    expect(capture.setWatchedCalls()).toEqual([[PRIVAT]]);
    expect(repo.watches()).toEqual([
      { packageName: PRIVAT, accountId: 'card', currency: 'UAH' },
    ]);
    expect(watchRows({ watches: repo.watches(), accounts })).toEqual([
      { packageName: PRIVAT, appName: 'Приват24', accountName: 'Приват' },
    ]);
  });

  it('Scenario: The monobank app is not offered and its package is refused', async () => {
    const capture = inMemoryNotificationCapture();
    const monobankPackage = `${MONOBANK_PACKAGE_PREFIX}.android`;

    // Not among the offered apps — it is not in the curated list at all, so no path offers it.
    expect(KNOWN_BANK_APPS.some((app) => app.packageName.startsWith(MONOBANK_PACKAGE_PREFIX))).toBe(
      false,
    );
    expect(
      appChoices({ watches: [], installed: 'unknown' }).some((app) =>
        app.packageName.startsWith(MONOBANK_PACKAGE_PREFIX),
      ),
    ).toBe(false);

    const change = await addWatchedApp(
      { packageName: monobankPackage, accountId: 'card', watches: repo.watches(), accounts },
      { capture, storage: repo },
    );

    expect(change.kind).toBe('refused');
    expect(change.kind === 'refused' && change.packages).toEqual([monobankPackage]);
    expect(change.kind === 'refused' && change.message).toContain('monobank');
    // Nothing stored, and the device was never told a set it refused.
    expect(repo.watches()).toEqual([]);
    expect(capture.setWatchedCalls()).toEqual([]);
    expect(capture.watched()).toEqual([]);
  });

  it('Scenario: A refused set changes nothing', async () => {
    const capture = inMemoryNotificationCapture();
    await addWatchedApp(
      { packageName: PRIVAT, accountId: 'card', watches: repo.watches(), accounts },
      { capture, storage: repo },
    );

    // A second app whose set the capture layer refuses — the monobank family rides along in it.
    const change = await addWatchedApp(
      {
        packageName: `${MONOBANK_PACKAGE_PREFIX}.beta`,
        accountId: 'card',
        watches: repo.watches(),
        accounts,
      },
      { capture, storage: repo },
    );

    expect(change.kind).toBe('refused');
    // The stored watches and the list are exactly what they were.
    expect(repo.watches().map((watch) => watch.packageName)).toEqual([PRIVAT]);
    expect(capture.watched()).toEqual([PRIVAT]);
  });

  it('An unavailable build stores nothing and says so', async () => {
    const capture = inMemoryNotificationCapture({ unavailable: true });

    const change = await addWatchedApp(
      { packageName: PRIVAT, accountId: 'card', watches: repo.watches(), accounts },
      { capture, storage: repo },
    );

    expect(change.kind).toBe('unavailable');
    expect(repo.watches()).toEqual([]);
  });

  it('Scenario: An already-watched app is rejected', async () => {
    const capture = inMemoryNotificationCapture();
    await addWatchedApp(
      { packageName: PRIVAT, accountId: 'card', watches: repo.watches(), accounts },
      { capture, storage: repo },
    );

    // Hand-named again, onto another рахунок: one app leads to one рахунок, so the second is
    // rejected rather than replacing the first.
    const change = await addWatchedApp(
      { packageName: PRIVAT, accountId: 'usd', watches: repo.watches(), accounts },
      { capture, storage: repo },
    );

    expect(change.kind).toBe('rejected');
    expect(repo.watches()).toEqual([
      { packageName: PRIVAT, accountId: 'card', currency: 'UAH' },
    ]);
    // The device was told once, when the watch was actually added.
    expect(capture.setWatchedCalls()).toHaveLength(1);
    // And the picker no longer offers it either.
    expect(
      appChoices({ watches: repo.watches(), installed: 'unknown' }).map((app) => app.packageName),
    ).not.toContain(PRIVAT);
  });

  it('Scenario: An archived рахунок is not offered', async () => {
    const capture = inMemoryNotificationCapture();
    await addWatchedApp(
      { packageName: PRIVAT, accountId: 'closed', watches: repo.watches(), accounts },
      { capture, storage: repo },
    );

    // Not among the offered рахунки…
    expect(accountChoicesFor(accounts, undefined).map((a) => a.id)).toEqual(['card', 'usd']);
    // …while a watch already mapped to it stays listed and keeps its name…
    expect(watchRows({ watches: repo.watches(), accounts })).toEqual([
      { packageName: PRIVAT, appName: 'Приват24', accountName: 'Закрита картка' },
    ]);

    // …and stays removable: the рахунок being archived is a decision about new money, not a
    // reason the owner cannot stop reading that app.
    const removed = await removeWatchedApp(
      { packageName: PRIVAT, watches: repo.watches() },
      { capture, storage: repo },
    );
    expect(removed).toEqual({ kind: 'removed', packageName: PRIVAT });
    expect(repo.watches()).toEqual([]);
  });

  it('Scenario: A removed watch leaves its чернетки', async () => {
    const capture = inMemoryNotificationCapture();
    await addWatchedApp(
      { packageName: PRIVAT, accountId: 'card', watches: repo.watches(), accounts },
      { capture, storage: repo },
    );
    await addWatchedApp(
      { packageName: 'ua.oschadbank.online', accountId: 'card', watches: repo.watches(), accounts },
      { capture, storage: repo },
    );
    const pending: Draft = {
      id: 'd1',
      accountId: 'card',
      currency: 'UAH',
      date: isoDate('2026-08-26'),
      text: 'Оплата 250.00UAH. Сільпо',
      proposal: { kind: 'expense', amount: money(25000, 'UAH') },
    };
    repo.commitOutcome(
      { kind: 'drafted', draft: pending, fingerprint: 'f1' },
      new Date('2026-08-26T12:00:00.000Z'),
    );

    const change = await removeWatchedApp(
      { packageName: PRIVAT, watches: repo.watches() },
      { capture, storage: repo },
    );

    expect(change).toEqual({ kind: 'removed', packageName: PRIVAT });
    // The device was told the set without that app…
    expect(capture.watched()).toEqual(['ua.oschadbank.online']);
    // …the list no longer shows the watch…
    expect(repo.watches().map((watch) => watch.packageName)).toEqual(['ua.oschadbank.online']);
    // …and the чернетка still awaits the owner on Головний.
    expect(repo.pendingDrafts()).toEqual([pending]);
    expect(removeConfirmation(PRIVAT)).toContain('залишаться');
  });

  it('A removal the device cannot take leaves the watch stored', async () => {
    // A watch stored while the build could still watch, on a build that no longer can. Deleting
    // the row anyway would leave the device reading an app the app itself no longer lists.
    repo.addWatch({ packageName: PRIVAT, accountId: 'card' });
    const capture = inMemoryNotificationCapture({ unavailable: true });

    const change = await removeWatchedApp(
      { packageName: PRIVAT, watches: repo.watches() },
      { capture, storage: repo },
    );

    expect(change.kind).toBe('unavailable');
    expect(repo.watches().map((watch) => watch.packageName)).toEqual([PRIVAT]);
  });

  it('A hand-named package must actually be a package', async () => {
    const capture = inMemoryNotificationCapture();

    const blank = await addWatchedApp(
      { packageName: '   ', accountId: 'card', watches: [] as Watch[], accounts },
      { capture, storage: repo },
    );
    const noAccount = await addWatchedApp(
      { packageName: 'ua.some.bank', accountId: 'gone', watches: [] as Watch[], accounts },
      { capture, storage: repo },
    );

    expect(blank.kind).toBe('rejected');
    expect(noAccount.kind).toBe('rejected');
    expect(capture.setWatchedCalls()).toEqual([]);
    expect(repo.watches()).toEqual([]);
  });
});

/**
 * Which of the curated apps the picker actually offers. An app the phone does not have can never
 * post a сповіщення, so offering it is offering a watch that will stay silent — but a phone that
 * could not be asked has not said "none", and its picker keeps the whole list.
 */
describe('the known bank apps the picker offers', () => {
  const OSCHAD = 'ua.oschadbank.online';
  const names = (choices: readonly { readonly packageName: string }[]) =>
    choices.map((app) => app.packageName);

  it('Scenario: Only installed bank apps are offered', () => {
    const offered = appChoices({ watches: [], installed: [PRIVAT] });

    expect(names(offered)).toEqual([PRIVAT]);
    expect(names(offered)).not.toContain(OSCHAD);
  });

  it('Scenario: A device that cannot answer offers the whole list', () => {
    expect(names(appChoices({ watches: [], installed: 'unknown' }))).toEqual(
      names(KNOWN_BANK_APPS),
    );
  });

  it('Scenario: No installed bank app leaves the hand-named package', () => {
    // Nothing to pick from — the screen draws no picker at all, and the typed package field, with
    // every rule it has, is untouched by any of this.
    expect(appChoices({ watches: [], installed: [] })).toEqual([]);
  });

  it('An already-watched app is not offered, installed or not', () => {
    const watches: Watch[] = [{ packageName: PRIVAT, accountId: 'card', currency: 'UAH' }];

    expect(names(appChoices({ watches, installed: [PRIVAT, OSCHAD] }))).toEqual([OSCHAD]);
    expect(names(appChoices({ watches, installed: 'unknown' }))).not.toContain(PRIVAT);
  });

  it('An installed app that is not one of the known ones is not invented', () => {
    // The list is curated; being installed does not put an app on it.
    expect(appChoices({ watches: [], installed: ['com.example.unrelated'] })).toEqual([]);
  });
});
