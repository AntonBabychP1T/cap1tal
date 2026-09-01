import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { remindersRepo, type RemindersRepo } from '../db/reminders-repo';
import { openTestDb, type TestStorage } from '../db/test-db';
import {
  inMemoryLocalNotifications,
  type LocalNotificationsDouble,
} from '../platform/local-notifications';
import { ALERT_NOTICES } from '../reminders/notices';
import { clear, raise, reportCollection, type AlertPorts } from './alerting';

const failedAt = new Date('2026-08-28T08:00:00.000Z');
const laterAt = new Date('2026-08-28T09:30:00.000Z');

describe('raising and clearing a сповіщення про збій', () => {
  let storage: TestStorage;
  let repo: RemindersRepo;
  let phone: LocalNotificationsDouble;
  let ports: AlertPorts;
  let now: Date;

  beforeEach(() => {
    storage = openTestDb();
    repo = remindersRepo(storage.db);
    phone = inMemoryLocalNotifications();
    now = failedAt;
    ports = { notifications: phone, storage: repo, now: () => now };
  });

  afterEach(() => storage.close());

  it('Scenario: A failed collection raises a сповіщення', async () => {
    await raise('collection', { attended: false }, ports);

    expect(phone.posted()).toEqual(['alert:collection']);
    expect(phone.showing()).toEqual(['alert:collection']);
    expect(repo.outstanding()).toEqual([{ kind: 'collection', raisedAt: failedAt }]);
  });

  it('Scenario: The same failure three times is one сповіщення', async () => {
    await raise('collection', { attended: false }, ports);
    now = laterAt;
    await raise('collection', { attended: false }, ports);
    await raise('collection', { attended: false }, ports);

    expect(phone.posted()).toEqual(['alert:collection']);
    // And the moment kept is the first one: when the owner stopped being told the truth.
    expect(repo.outstanding()).toEqual([{ kind: 'collection', raisedAt: failedAt }]);
  });

  it('Scenario: Success clears it', async () => {
    await raise('monobank-sync', { attended: false }, ports);
    await clear('monobank-sync', ports);

    expect(repo.outstanding()).toEqual([]);
    expect(phone.cleared()).toEqual(['alert:monobank-sync']);
    expect(phone.showing()).toEqual([]);
  });

  it('Scenario: A restart does not announce the same failure again', async () => {
    await raise('backup', { attended: false }, ports);

    // The app closed and opened: the row is in storage, and the port is a fresh phone whose
    // notification is still in the shade. The same failure once more announces nothing new.
    const reopened = inMemoryLocalNotifications();
    const after: AlertPorts = { notifications: reopened, storage: repo, now: () => laterAt };
    await raise('backup', { attended: false }, after);

    expect(reopened.posted()).toEqual([]);
    expect(repo.outstanding()).toEqual([{ kind: 'backup', raisedAt: failedAt }]);
  });

  it('Scenario: Two different failures stand side by side', async () => {
    await raise('collection', { attended: false }, ports);
    await raise('monobank-sync', { attended: false }, ports);

    expect(phone.showing()).toEqual(['alert:collection', 'alert:monobank-sync']);

    await clear('collection', ports);

    expect(repo.outstandingKinds()).toEqual(['monobank-sync']);
    expect(phone.showing()).toEqual(['alert:monobank-sync']);
  });

  it('Scenario: A failure the owner is looking at raises nothing', async () => {
    await raise('backup', { attended: true }, ports);

    expect(phone.posted()).toEqual([]);
    // Nothing remembered either: the screen reported it, and there is nothing left to clear.
    expect(repo.outstanding()).toEqual([]);
  });

  it('Scenario: Opening the screen it leads to clears it', async () => {
    await raise('saldo-import', { attended: false }, ports);

    // «Імпорт Saldo» opening is one unconditional call; it does not know one was outstanding.
    await clear('saldo-import', ports);

    expect(repo.outstanding()).toEqual([]);
    expect(phone.showing()).toEqual([]);
  });

  it('clears a kind that was never outstanding without touching the phone', async () => {
    await clear('backup', ports);

    expect(phone.cleared()).toEqual([]);
    expect(repo.outstanding()).toEqual([]);
  });

  it('Scenario: A failure is announced with no network', async () => {
    // Nothing in this path asks anything of a network: the port is the phone's own shade, and the
    // record is the phone's own database. The double makes no request because there is none to
    // make — which is the requirement (vision §14.14: no push service, no token, no server).
    await raise('monobank-sync', { attended: false }, ports);

    expect(phone.posted()).toEqual(['alert:monobank-sync']);
    expect(repo.outstandingKinds()).toEqual(['monobank-sync']);
  });

  it('Scenario: A failure without notifications is still remembered', async () => {
    const mute = inMemoryLocalNotifications({ permission: 'unsupported' });
    const muted: AlertPorts = { notifications: mute, storage: repo, now: () => failedAt };

    await raise('local-save', { attended: false }, muted);

    expect(mute.posted()).toEqual([]);
    expect(repo.outstandingKinds()).toEqual(['local-save']);

    // And the same failure again raises no second one, because it was remembered.
    await raise('local-save', { attended: false }, muted);
    expect(repo.outstanding()).toEqual([{ kind: 'local-save', raisedAt: failedAt }]);
  });

  it('remembers a failure on a phone that refused the permission, too', async () => {
    const refused = inMemoryLocalNotifications({ permission: 'denied' });
    const ignored: AlertPorts = { notifications: refused, storage: repo, now: () => failedAt };

    await raise('backup', { attended: false }, ignored);

    expect(refused.posted()).toEqual([]);
    expect(repo.outstandingKinds()).toEqual(['backup']);
  });
});

describe('what one pass of the drain announces', () => {
  let storage: TestStorage;
  let repo: RemindersRepo;
  let phone: LocalNotificationsDouble;
  let ports: AlertPorts;

  beforeEach(() => {
    storage = openTestDb();
    repo = remindersRepo(storage.db);
    phone = inMemoryLocalNotifications();
    ports = { notifications: phone, storage: repo, now: () => failedAt };
  });

  afterEach(() => storage.close());

  it('Scenario: Withdrawn notification access is announced like a failed collection', async () => {
    await reportCollection({ access: 'denied', watched: true, failed: false }, ports);

    expect(phone.posted()).toEqual(['alert:collection']);
    expect(repo.outstandingKinds()).toEqual(['collection']);

    // A second opening with the access still withdrawn adds no second one.
    await reportCollection({ access: 'denied', watched: true, failed: false }, ports);
    expect(phone.posted()).toEqual(['alert:collection']);
  });

  it('announces a build that cannot read them at all the same way', async () => {
    await reportCollection({ access: 'unsupported', watched: true, failed: false }, ports);

    expect(repo.outstandingKinds()).toEqual(['collection']);
  });

  it('Scenario: Withdrawn access with nothing watched announces nothing', async () => {
    await reportCollection({ access: 'denied', watched: false, failed: false }, ports);

    expect(phone.posted()).toEqual([]);
    expect(repo.outstanding()).toEqual([]);
  });

  it('announces a collection that ran and failed', async () => {
    await reportCollection({ access: 'granted', watched: true, failed: true }, ports);

    expect(phone.posted()).toEqual(['alert:collection']);
    expect(repo.outstandingKinds()).toEqual(['collection']);
  });

  it('clears it when the next collection stores everything it collected', async () => {
    await reportCollection({ access: 'granted', watched: true, failed: true }, ports);
    await reportCollection({ access: 'granted', watched: true, failed: false }, ports);

    expect(repo.outstanding()).toEqual([]);
    expect(phone.showing()).toEqual([]);
  });

  it('says nothing at all about a device with the access granted and nothing wrong', async () => {
    await reportCollection({ access: 'granted', watched: false, failed: false }, ports);

    expect(phone.posted()).toEqual([]);
    expect(phone.cleared()).toEqual([]);
  });
});

describe('the failures of work the owner asked for and then left', () => {
  let storage: TestStorage;
  let repo: RemindersRepo;
  let phone: LocalNotificationsDouble;
  let ports: AlertPorts;

  beforeEach(() => {
    storage = openTestDb();
    repo = remindersRepo(storage.db);
    phone = inMemoryLocalNotifications();
    ports = { notifications: phone, storage: repo, now: () => failedAt };
  });

  afterEach(() => storage.close());

  it('Scenario: A sync that fails after the owner left the app raises a сповіщення', async () => {
    // The screen passes whether the app is in front of them at the moment the run ends — and a
    // sync pacing itself a minute per request is the one they are least likely to be watching.
    await raise('monobank-sync', { attended: false }, ports);

    expect(phone.posted()).toEqual(['alert:monobank-sync']);
    expect(ALERT_NOTICES['monobank-sync'].title).toContain('monobank');
    expect(ALERT_NOTICES['monobank-sync'].route).toBe('/manage/monobank');
    expect(repo.outstandingKinds()).toEqual(['monobank-sync']);
  });

  it('Scenario: A failed import commit leads back to the import', async () => {
    await raise('saldo-import', { attended: false }, ports);

    expect(phone.posted()).toEqual(['alert:saldo-import']);
    // Where the failure is explained in full and the commit can be tried again.
    expect(ALERT_NOTICES['saldo-import'].route).toBe('/manage/saldo-import');
  });

  it('says nothing about a sync that failed while the owner watched it', async () => {
    await raise('monobank-sync', { attended: true }, ports);

    expect(phone.posted()).toEqual([]);
    expect(repo.outstanding()).toEqual([]);
  });
});

/**
 * The five call sites live in JSX that `verify` never runs. Each is one line over the functions
 * proven above, and what this holds is that the line is there, that it passes the one thing only
 * a screen knows, and — the part that would be easy to break — that adding it changed none of the
 * words those screens already said about their own failures.
 */
describe('the five places a failure is already a value', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  const layout = source('../app/_layout.tsx');
  const monobank = source('../app/manage/monobank.tsx');
  const saldo = source('../app/manage/saldo-import.tsx');
  const backup = source('../app/manage/backup.tsx');
  const main = source('../app/(tabs)/index.tsx');
  const notifications = source('../app/manage/notifications.tsx');

  it('raises each kind where that work already produces its failure', () => {
    // The drain: unattended by definition, because it runs precisely while the app is open, so
    // it passes no `attended` at all. Both of its branches report — the one that could not
    // collect because the access is gone, and the one that collected and could not store.
    expect([...layout.matchAll(/await reportCollection\(\{ access, watched, failed:/g)]).toHaveLength(2);
    expect(layout).toContain('failed: report.failure !== undefined }');
    expect(layout).not.toContain('reportCollection({ access, watched, failed: false }, NOTIFY);\n      const report');

    // The four screens: each passes whether the app is in front of the owner right now.
    for (const [screen, kind] of [
      [monobank, 'monobank-sync'],
      [saldo, 'saldo-import'],
      [backup, 'backup'],
      [main, 'local-save'],
    ] as const) {
      expect(screen, kind).toContain(`raiseAlert('${kind}', { attended: attended() }, ALERT_PORTS)`);
    }
  });

  it('clears each kind on opening the screen that сповіщення leads to', () => {
    expect(monobank).toContain("useClearAlertOnOpen('monobank-sync')");
    expect(saldo).toContain("useClearAlertOnOpen('saldo-import')");
    expect(backup).toContain("useClearAlertOnOpen('backup')");
    expect(main).toContain("useClearAlertOnOpen('local-save')");
    // «Сповіщення банків» is where a collection сповіщення leads, so it clears that one.
    expect(notifications).toContain("useClearAlertOnOpen('collection')");
  });

  it('clears each kind when that same work next succeeds', () => {
    expect(monobank).toContain("clearAlert('monobank-sync', ALERT_PORTS)");
    expect(saldo).toContain("clearAlert('saldo-import', ALERT_PORTS)");
    expect(backup).toContain("clearAlert('backup', ALERT_PORTS)");
    expect(main).toContain("clearAlert('local-save', ALERT_PORTS)");
  });

  it('changed none of the words those screens already said about a failure', () => {
    // Every one of these is the screen's own report, in its own words, and it is what the owner
    // reads when they are there. The сповіщення is the second copy for when they are not, and it
    // may not have replaced or reworded any of them.
    expect(monobank).toContain("Alert.alert('Не приєднано', failureMessage(error))");
    expect(saldo).toContain('setFlow((current) => commitFailed(current, failureMessage(error)))');
    expect(saldo).toContain("Alert.alert('Не вдалося прочитати файл', failureMessage(error))");
    expect(main).toContain("Alert.alert('Не записано', failureMessage(error))");
    expect(main).toContain("Alert.alert('Не підтверджено', failureMessage(error))");
    // «Бекап» reports through its own state, and the banner still shows that state's message.
    expect(backup).toContain('{message ? <Banner>{message}</Banner> : null}');
  });

  it('decides nothing at the call sites — every rule is in a tested module', () => {
    for (const screen of [layout, monobank, saldo, backup, main, notifications]) {
      expect(screen).not.toContain('decideAlert');
      expect(screen).not.toContain('decideClear');
      expect(screen).not.toContain('outstandingKinds()');
    }
  });
});
