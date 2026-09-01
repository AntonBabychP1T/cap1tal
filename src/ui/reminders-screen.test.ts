import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { LocalNotificationPermission } from '../platform/local-notifications';
import { DEFAULT_REMINDER_TIME } from '../reminders/time';
import type { ReminderState } from './reminder-schedule';
import {
  changeTime,
  permissionLine,
  remindersSection,
  REMINDERS_EXPLANATION,
  REMINDERS_PRIVACY,
} from './reminders-screen';

const at21 = { hour: 21, minute: 0 };
const at930 = { hour: 9, minute: 30 };

function state(over: Partial<ReminderState> = {}): ReminderState {
  const permission: LocalNotificationPermission = over.permission ?? 'granted';
  const preference = over.preference ?? { enabled: false };
  return {
    permission,
    preference,
    arranged: over.arranged ?? (preference.enabled && permission === 'granted'),
  };
}

describe('what the section says it is for', () => {
  it('Scenario: The section says what the app will post', () => {
    const section = remindersSection(state());

    expect(section.explanation).toBe(REMINDERS_EXPLANATION);
    // The two things, and the statement that there is nothing else.
    expect(section.explanation).toContain('щоденне нагадування');
    expect(section.explanation).toContain('збій');
    expect(section.explanation).toContain('лише два види');
  });

  it('Scenario: The privacy promise is on the screen', () => {
    const section = remindersSection(state());

    expect(section.privacy).toBe(REMINDERS_PRIVACY);
    for (const promised of ['суми', 'рахунку', 'категорії', 'сповіщень банків']) {
      expect(section.privacy, promised).toContain(promised);
    }
    // And that nothing is sent anywhere: every notification is this phone's own (vision §14.14).
    expect(section.privacy).toContain('Нічого нікуди не надсилається');
  });
});

describe('the permission as the section reports it', () => {
  it('Scenario: A refused permission offers where to grant it', () => {
    const line = permissionLine('denied');

    expect(line.status).toContain('не надано');
    expect(line.grant).toBeDefined();
    expect(line.switchable).toBe(true);
    // And nothing claims a нагадування will arrive.
    expect(remindersSection(state({ permission: 'denied', preference: { enabled: true, time: at21 } })).arrival)
      .toContain('не прийде');
  });

  it('Scenario: A device that cannot notify offers nothing to press', () => {
    const line = permissionLine('unsupported');

    // Unavailable, not refused: the phone cannot post them at all, so there is no system screen
    // with a switch on it to send the owner to.
    expect(line.status).toContain('не може');
    expect(line.grant).toBeUndefined();
    expect(line.switchable).toBe(false);

    const section = remindersSection(state({ permission: 'unsupported', preference: { enabled: true, time: at21 } }));
    expect(section.on).toBe(false);
    expect(section.permission.grant).toBeUndefined();
  });

  it('offers the system screen even when it is granted, so it can be taken back', () => {
    const line = permissionLine('granted');

    expect(line.status).toContain('надано');
    expect(line.grant).toBeDefined();
    expect(line.switchable).toBe(true);
  });
});

describe('the switch and what it says will happen', () => {
  it('Scenario: Turning it on with permission granted', () => {
    const section = remindersSection(state({ preference: { enabled: true, time: at930 } }));

    expect(section.on).toBe(true);
    expect(section.time).toBe('09:30');
    // The hour it will arrive, without claiming the minute — Android may delay an alarm.
    expect(section.arrival).toContain('09:30');
    expect(section.arrival).toContain('близько');
  });

  it('Scenario: Turning it on with permission refused', () => {
    // `turnOn` stored nothing and the permission came back refused; the switch shows off, the
    // refusal is stated, and the system screen is offered.
    const section = remindersSection(state({ permission: 'denied', preference: { enabled: false } }));

    expect(section.on).toBe(false);
    expect(section.permission.status).toContain('не надано');
    expect(section.permission.grant).toBeDefined();
  });

  it('Scenario: Turning it off asks nothing', () => {
    const section = remindersSection(state({ preference: { enabled: false, time: at21 } }));

    expect(section.on).toBe(false);
    expect(section.arrival).toBe('Нагадування вимкнене.');
    // The hour the owner chose is still shown, so turning it back on offers it rather than 21:00.
    expect(section.time).toBe('21:00');
  });

  it('never shows as on what the phone cannot deliver', () => {
    // The owner's answer survives a revoked permission — granting it again brings the нагадування
    // back — but the section says plainly that nothing will arrive meanwhile.
    const section = remindersSection(state({ permission: 'denied', preference: { enabled: true, time: at21 } }));

    expect(section.on).toBe(false);
    expect(section.arrival).toContain('дозвіл');
  });

  it('suggests 21:00 on a device that was never asked, without claiming it as an answer', () => {
    const section = remindersSection(state());

    expect(section.time).toBe('21:00');
    expect(section.time).toBe(
      `${String(DEFAULT_REMINDER_TIME.hour).padStart(2, '0')}:${String(DEFAULT_REMINDER_TIME.minute).padStart(2, '0')}`,
    );
  });
});

describe('the time the owner types', () => {
  it('Scenario: A new time is taken', () => {
    expect(changeTime('09:30')).toEqual({ kind: 'time', time: at930 });
    expect(changeTime('9:30')).toEqual({ kind: 'time', time: at930 });
  });

  it('Scenario: A value that is not a time changes nothing', () => {
    const change = changeTime('25:70');

    expect(change.kind).toBe('refused');
    expect(change.kind === 'refused' && change.message).toContain('24 години');
    // Nothing about the section moves: the time in force is the stored one, untouched.
    expect(remindersSection(state({ preference: { enabled: true, time: at21 } })).time).toBe('21:00');
  });

  it('Scenario: An empty time changes nothing', () => {
    const change = changeTime('');

    expect(change.kind).toBe('refused');
    expect(change.kind === 'refused' && change.message).toContain('порожнє');
  });
});

/**
 * One fact about this section lives in JSX that `verify` never runs: *when* the permission is
 * re-read. It is a SHALL in the delta spec and cannot be reached by executing a pure module, so
 * it is held structurally — the technique `notifications-screen.test.ts` uses, for the same reason.
 */
describe('the section reads the phone, never a memory', () => {
  const screen = readFileSync(new URL('../app/manage/reminders.tsx', import.meta.url), 'utf8');

  it('Scenario: Returning from the system screen updates the state', () => {
    // The permission is granted on Android's own screen, which is another app: this screen never
    // loses navigation focus while the owner is over there, so a focus effect alone would still
    // be showing «не надано» on their return. The foreground transition is what happens.
    expect(screen).toContain('useFocusEffect(read)');
    expect(screen).toContain('useOnForeground(read)');
    expect(screen).toContain('reconcileOnLaunch(PORTS)');
  });

  it('holds no decision of its own — it calls the tested modules', () => {
    // Everything about what to show and what to arrange is proven in this file and in
    // `reminder-schedule.test.ts`. The shell must not grow a second copy of any of it.
    expect(screen).toContain('remindersSection(state)');
    for (const decided of ['reconcile({', 'decideAlert', 'parseTimeOfDay(', 'scheduleDaily(']) {
      expect(screen, decided).not.toContain(decided);
    }
  });

  it('asks for the permission at the switch and nowhere else', () => {
    // Not on first run: the app must be worth reminding about before it asks (proposal).
    expect(screen).toContain('turnOn(change.time, PORTS)');
    expect(screen).not.toContain('.ask()');
  });
});
