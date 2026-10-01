import {
  INSTALLMENT_REMINDER_MINUTE_OF_DAY,
  installmentPartStates,
  installmentReminderDates,
  isActiveInstallment,
  type Installment,
  type InstallmentFacts,
} from '../domain/installments';
import type { IsoDate } from '../domain/transaction';
import type {
  LocalNotificationPermission,
  LocalNotificationsPort,
} from '../platform/local-notifications';
import { installmentDueNotice, isInstallmentDueId, type Notice } from './notices';
import type { TimeOfDay } from './time';

/**
 * What the phone should hold of the нагадування про платіж (installments, "The app warns the day
 * before an expected платіж"; design D5): one dated arrangement at 10:00 the day before every дата
 * on which an active розстрочка has an expected платіж, while the switch is on and the permission
 * granted — and none otherwise.
 *
 * Like the daily нагадування it re-asserts rather than checks (`schedule.ts`): every held
 * arrangement of this kind is cancelled and every wanted one arranged again, each time. One run
 * withdraws a warning whose платіж was debited early or closed, and re-computes the instant of the
 * rest in whatever zone the phone is now in.
 */

/** 10:00, phone time. */
export const INSTALLMENT_REMINDER_TIME: TimeOfDay = {
  hour: Math.floor(INSTALLMENT_REMINDER_MINUTE_OF_DAY / 60),
  minute: INSTALLMENT_REMINDER_MINUTE_OF_DAY % 60,
};

export interface InstallmentReminderInput {
  /** Every розстрочка; closed and сплачені ones simply want nothing. */
  readonly installments: readonly Installment[];
  readonly facts: InstallmentFacts;
  /** The switch of the нагадування про платіж. */
  readonly enabled: boolean;
  /** The phone's day and minute right now. */
  readonly now: { readonly date: IsoDate; readonly minuteOfDay: number };
}

export interface InstallmentReminderPlan {
  /** Every held arrangement of this kind — all of them go, the wanted ones come back below. */
  readonly cancel: readonly string[];
  readonly schedule: readonly {
    readonly notice: Notice;
    readonly at: { readonly date: IsoDate; readonly time: TimeOfDay };
  }[];
}

/** The дати the phone should be warned on, before the switch and the permission are asked. */
export function wantedReminderDates(input: InstallmentReminderInput): IsoDate[] {
  const parts = input.installments
    .map((installment) => installmentPartStates(installment, input.facts, input.now.date))
    .filter(isActiveInstallment)
    .flatMap((status) => status.parts);
  return installmentReminderDates(parts, input.now);
}

export function planInstallmentReminders(
  input: InstallmentReminderInput & {
    readonly permission: LocalNotificationPermission;
    /** The ids the system holds arranged right now — the port's `scheduledIds()`. */
    readonly scheduled: readonly string[];
  },
): InstallmentReminderPlan {
  const wanted = input.enabled && input.permission === 'granted' ? wantedReminderDates(input) : [];
  return {
    cancel: input.scheduled.filter(isInstallmentDueId),
    schedule: wanted.map((date) => ({
      notice: installmentDueNotice(date),
      at: { date, time: INSTALLMENT_REMINDER_TIME },
    })),
  };
}

/**
 * Asks the phone what it holds and what it allows, and makes it hold exactly the plan. Every caller
 * — launch, the end of a background run, a restore, a screen whose linking changed something, an
 * edit of a розстрочка — goes through here.
 */
export async function reassertInstallmentReminders(
  port: LocalNotificationsPort,
  input: InstallmentReminderInput,
): Promise<void> {
  const [permission, scheduled] = await Promise.all([port.permission(), port.scheduledIds()]);
  const plan = planInstallmentReminders({ ...input, permission, scheduled });
  for (const id of plan.cancel) {
    await port.cancelDaily(id);
  }
  for (const { notice, at } of plan.schedule) {
    await port.scheduleAt(notice, at);
  }
}
