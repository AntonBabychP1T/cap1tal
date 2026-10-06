import {
  installmentPartStates,
  isActiveInstallment,
  type Installment,
  type InstallmentFacts,
  type InstallmentStatus,
} from '../domain/installments';
import { money } from '../domain/money';
import type {
  LocalNotificationPermission,
  LocalNotificationsPort,
} from '../platform/local-notifications';
import { formatMoney } from './amount-input';
import { calendarLabel, todayIso } from './dates';

/**
 * The «Розстрочки» screen, with none of its JSX (installments-screen, "Розстрочки opens on the
 * active ones, nearest платіж first"; "The screen holds the switch of the нагадування про платіж").
 * The list, what each row says, and when the phone is asked for permission are decided here, where
 * `verify` reaches them.
 */

/** What the screen says when there is no розстрочка at all — one sentence, then «Нова розстрочка». */
export const INSTALLMENTS_EMPTY =
  'Запишіть покупку частинами — і застосунок знатиме, які витрати є її платежами, скільки ще ' +
  'лишилось сплатити і коли попередити про наступний платіж.';

/** One розстрочка as its row reads. */
export interface InstallmentRow {
  readonly id: string;
  readonly name: string;
  /** «4 з 10». */
  readonly progress: string;
  /** The залишок розстрочки: «6 000,00 UAH». */
  readonly remaining: string;
  /** «5 жовтня · 1 000,00 UAH» — the next платіж not сплачено; absent once none is left. */
  readonly next?: string;
  /** Said on the row when a платіж of it is списання не знайдено. */
  readonly missed?: string;
  /** Closed early rather than paid off — said under «Закриті». */
  readonly closedEarly?: true;
}

export interface InstallmentList {
  readonly active: readonly InstallmentRow[];
  /** Сплачені and closed early, under «Закриті». */
  readonly closed: readonly InstallmentRow[];
  /** The one sentence, when there is no розстрочка at all. */
  readonly empty?: string;
}

const uah = (amount: number) => formatMoney(money(amount, 'UAH'));

/** «Списання не знайдено» — said on a row whose платіж passed three days ago with nothing linked. */
export const MISSED_DEBIT = 'Списання не знайдено';

function rowOf(status: InstallmentStatus, now: Date): InstallmentRow {
  const { installment, next } = status;
  const missed = status.parts.some((part) => part.state === 'notFound');
  return {
    id: installment.id,
    name: installment.name,
    progress: `${status.paidCount} з ${installment.partsCount}`,
    remaining: uah(status.remaining),
    ...(next && next.state !== 'closed'
      ? { next: `${calendarLabel(next.due, now)} · ${uah(next.amount)}` }
      : {}),
    ...(missed && !status.closed ? { missed: MISSED_DEBIT } : {}),
    ...(status.closed ? { closedEarly: true as const } : {}),
  };
}

/**
 * The active розстрочки, nearest next платіж first (then the one recorded first), and the сплачені
 * and closed ones under «Закриті», most recently recorded first.
 */
export function installmentList(
  installments: readonly Installment[],
  facts: InstallmentFacts,
  now: Date,
): InstallmentList {
  if (installments.length === 0) {
    return { active: [], closed: [], empty: INSTALLMENTS_EMPTY };
  }
  const today = todayIso(now);
  const statuses = installments.map((i) => installmentPartStates(i, facts, today));
  const active = statuses
    .filter(isActiveInstallment)
    .sort(
      (a, b) =>
        (a.next?.due ?? '').localeCompare(b.next?.due ?? '') ||
        a.installment.recordedAt - b.installment.recordedAt,
    );
  const closed = statuses
    .filter((s) => !isActiveInstallment(s))
    .sort((a, b) => b.installment.recordedAt - a.installment.recordedAt);
  return { active: active.map((s) => rowOf(s, now)), closed: closed.map((s) => rowOf(s, now)) };
}

// ---------------------------------------------------------------------------------------------
// The switch of the нагадування про платіж

/** What the switch needs of storage — `src/db/installments-repo.ts`. */
export interface InstallmentReminderSwitchStorage {
  reminder(): { readonly enabled: boolean; readonly asked: boolean };
  setReminderEnabled(enabled: boolean): void;
  markAsked(): void;
}

export interface InstallmentSwitchPorts {
  readonly notifications: LocalNotificationsPort;
  readonly storage: InstallmentReminderSwitchStorage;
}

/** «Нагадувати за день до платежу». */
export const INSTALLMENT_REMINDER_SWITCH = 'Нагадувати за день до платежу';

/**
 * Asks the phone for notification permission once on behalf of the нагадування про платіж — only
 * while the switch is on, the phone does not allow it, and the app has not asked for them before.
 * The port cannot tell "never asked" from "refused", so the app remembers it asked; nothing resets
 * that, and from then on the screen offers the phone's own settings instead (design D5).
 */
export async function askOnceForReminders(
  ports: InstallmentSwitchPorts,
): Promise<LocalNotificationPermission> {
  const permission = await ports.notifications.permission();
  const { enabled, asked } = ports.storage.reminder();
  if (!enabled || asked || permission !== 'denied') {
    return permission;
  }
  ports.storage.markAsked();
  return ports.notifications.ask();
}

/** The switch turned on or off. On asks only while the app has never asked (spec). */
export async function setRemindersOn(
  on: boolean,
  ports: InstallmentSwitchPorts,
): Promise<LocalNotificationPermission> {
  ports.storage.setReminderEnabled(on);
  return on ? askOnceForReminders(ports) : ports.notifications.permission();
}

/** What the screen says under the switch, and whether it offers the phone's settings. */
export interface ReminderLine {
  readonly text?: string;
  readonly offerSettings: boolean;
}

export function reminderLine(enabled: boolean, permission: LocalNotificationPermission): ReminderLine {
  if (!enabled || permission === 'granted') {
    return { offerSettings: false };
  }
  if (permission === 'unsupported') {
    return {
      text: 'Ця збірка не вміє надсилати сповіщення — нагадування про платіж не прийдуть.',
      offerSettings: false,
    };
  }
  return {
    text: 'Телефон не дозволяє застосунку сповіщення — нагадування про платіж не прийдуть.',
    offerSettings: true,
  };
}
