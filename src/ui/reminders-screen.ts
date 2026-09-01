import type { LocalNotificationPermission } from '../platform/local-notifications';
import { formatTimeOfDay, parseTimeOfDay, DEFAULT_REMINDER_TIME, type TimeOfDay } from '../reminders/time';
import type { ReminderState } from './reminder-schedule';

/**
 * What «Нагадування» says and what it lets the owner decide, with none of its JSX — so `verify`,
 * which never runs a screen and never loads a native module, holds the section to what the spec
 * says it must offer.
 *
 * Two things live here and nowhere else. The permission is reported exactly as the device answers
 * it, and a way to the system screen is offered only where there is one to offer — the same rule
 * «Сповіщення банків» keeps for the other permission, and for the same reason. And the time is a
 * typed field with a parse: what is not a time is refused in words and the time already set stands
 * (design D11), the discipline `amount-input.ts` applies to суми.
 */

/**
 * What the app posts, stated before anything can be switched. One constant, because the screen
 * shows it whether or not the device has answered yet — two copies would be two promises, and only
 * one of them under test.
 */
export const REMINDERS_EXPLANATION =
  'Застосунок надсилає лише два види сповіщень: одне щоденне нагадування записати витрати, ' +
  'якщо ви його ввімкнете, і сповіщення про збій, коли те, що застосунок робив сам, не вдалося.';

/**
 * The promise design D4 makes a property of the code — said on the screen too, because the owner
 * cannot read `notices.ts`. Every word of it is true by construction: the notices are
 * parameterless constants, and every notification is scheduled by this phone for this phone.
 */
export const REMINDERS_PRIVACY =
  'У сповіщеннях немає ні суми, ні рахунку, ні категорії, ні тексту сповіщень банків. ' +
  'Нічого нікуди не надсилається — усе планує сам телефон.';

/** What the section shows about the permission, and whether there is anywhere to send the owner. */
export interface PermissionLine {
  readonly permission: LocalNotificationPermission;
  /** The state in the owner's words. */
  readonly status: string;
  /** The way to the system screen where notifications are allowed, when there is one. */
  readonly grant?: string;
  /** Whether the switch can be turned on at all on this device. */
  readonly switchable: boolean;
}

/**
 * The permission as words.
 *
 * `unsupported` is offered no system screen, exactly as an unsupported notification *access* is:
 * there is no switch for the owner to find, and sending them to look for one is worse than saying
 * the phone cannot do it. It is the whole reason that answer is separate from `denied`.
 */
export function permissionLine(permission: LocalNotificationPermission): PermissionLine {
  if (permission === 'unsupported') {
    return {
      permission,
      status: 'Цей телефон не може показувати сповіщення застосунку.',
      switchable: false,
    };
  }
  if (permission === 'denied') {
    return {
      permission,
      status: 'Дозвіл на сповіщення не надано — нагадування не прийде.',
      grant: 'Дозволити в налаштуваннях',
      switchable: true,
    };
  }
  return {
    permission,
    status: 'Дозвіл на сповіщення надано.',
    grant: 'Налаштування сповіщень',
    switchable: true,
  };
}

/** The whole section, as values: the two sentences, the permission, the switch and the time. */
export interface RemindersSection {
  readonly explanation: string;
  readonly privacy: string;
  readonly permission: PermissionLine;
  /** Whether the switch shows as on. Never on without the permission that makes it true. */
  readonly on: boolean;
  /** The time the нагадування is set for, as «HH:MM» — the owner's, or the suggested one. */
  readonly time: string;
  /** What the section says about when it will arrive, or why it will not. */
  readonly arrival: string;
}

/**
 * Everything the section shows for one state of the world.
 *
 * The switch follows the *arrangement*, not the stored preference: a permission revoked behind the
 * app's back leaves the owner's answer in storage — so granting it again brings the нагадування
 * back — while the section says plainly that nothing will arrive (spec: the нагадування SHALL NOT
 * be shown as arranged while it cannot be).
 */
export function remindersSection(state: ReminderState): RemindersSection {
  const time = formatTimeOfDay(state.preference.time ?? DEFAULT_REMINDER_TIME);
  return {
    explanation: REMINDERS_EXPLANATION,
    privacy: REMINDERS_PRIVACY,
    permission: permissionLine(state.permission),
    on: state.arranged,
    time,
    arrival: arrivalOf(state, time),
  };
}

function arrivalOf(state: ReminderState, time: string): string {
  if (state.arranged) {
    // «Близько» rather than a promise of the minute: Android may delay an alarm, and the app does
    // not claim a clock guarantee it cannot keep.
    return `Нагадування приходитиме щодня близько ${time}.`;
  }
  if (state.preference.enabled) {
    return 'Нагадування не прийде, доки не надано дозвіл на сповіщення.';
  }
  return 'Нагадування вимкнене.';
}

/** What the owner typed into the time field came to. */
export type TimeChange =
  | { readonly kind: 'time'; readonly time: TimeOfDay }
  /** Refused: the message is shown beside the field and the time already set stands. */
  | { readonly kind: 'refused'; readonly message: string };

/**
 * A typed time, or the refusal to show beside the field. A thin pass through `parseTimeOfDay` —
 * it is here so the screen has one function to call and the section's rule («a value that is not a
 * time changes nothing») is asserted where the rest of the section's rules are.
 */
export function changeTime(typed: string): TimeChange {
  const parsed = parseTimeOfDay(typed);
  return parsed.kind === 'time'
    ? { kind: 'time', time: parsed.time }
    : { kind: 'refused', message: parsed.message };
}
