import type { Href } from 'expo-router';

import type { NotificationAccess } from '../platform/notification-access';
import { accessSection } from './notification-settings';

/**
 * «Перші кроки» — what the app needs before it can answer either of its two questions, as data
 * rather than as JSX, so `verify` (which never runs a screen) holds the checklist to what the
 * spec says it offers. The same reason `settings-sections.ts` is data.
 *
 * Nothing here reads or writes anything: the screen hands in what it has already loaded, and
 * this decides what each step says. A checklist that could change the device would be a checklist
 * the owner has to be careful with.
 */

export type StepId = 'account' | 'monobank' | 'saldo' | 'notifications';

/**
 * Done, still to do, or not available on this device — three states, not two. `unavailable` is
 * what stops the app offering a way to do something it cannot do, and it is the honest answer for
 * the notification permission until the listener exists.
 */
export type StepState = 'done' | 'todo' | 'unavailable';

/**
 * The one thing a step offers. Two kinds, because one of them does not go to a screen of this
 * app: granting notification access happens in Android's own settings.
 */
export type StepAction =
  | {
      readonly kind: 'open';
      readonly title: string;
      /** A typed route, so a step pointing at a screen that does not exist fails to compile. */
      readonly href: Extract<Href, string>;
    }
  | { readonly kind: 'notification-settings'; readonly title: string };

export interface OnboardingStep {
  readonly id: StepId;
  readonly title: string;
  /** What it is for, in the owner's terms — one line, and the reason when it is unavailable. */
  readonly hint: string;
  readonly state: StepState;
  /** Absent exactly when the step is `unavailable`: an action leading nowhere is worse than none. */
  readonly action?: StepAction;
}

/**
 * Whether this launch should open on the checklist: a device holding no рахунок and no
 * транзакція. Read from the data rather than from a remembered flag, because a flag can disagree
 * with the device — a restored backup or cleared data would say "finished" over an empty phone.
 *
 * It is also exactly the state in which Головний can do nothing: with no рахунок the «+» refuses
 * every entry. So the checklist replaces a dead end, not an interesting screen.
 */
export function firstRun(input: {
  readonly accounts: number;
  readonly transactions: number;
}): boolean {
  return input.accounts === 0 && input.transactions === 0;
}

/**
 * The steps and their state. In the order they are worth doing: a рахунок first, because nothing
 * can be recorded without one; then the bank that fills itself in; then the history; then the
 * permission that is not available yet.
 */
export function onboardingSteps(input: {
  readonly accounts: number;
  readonly monobankConfigured: boolean;
  readonly saldoImported: boolean;
  readonly notificationAccess: NotificationAccess;
}): OnboardingStep[] {
  return [
    {
      id: 'account',
      title: 'Перший рахунок',
      hint: 'Картка, готівка, банка чи інвестиційний рахунок. Без жодного рахунку записати витрату нема куди.',
      state: input.accounts > 0 ? 'done' : 'todo',
      action: { kind: 'open', title: 'Відкрити «Рахунки»', href: '/accounts' },
    },
    {
      id: 'monobank',
      title: 'monobank',
      hint: 'Токен банку — і транзакції та баланси підтягуються самі. Токен зберігається лише в захищеному сховищі телефона.',
      state: input.monobankConfigured ? 'done' : 'todo',
      action: {
        kind: 'open',
        title: input.monobankConfigured ? 'Відкрити monobank' : 'Отримати токен',
        href: '/manage/monobank',
      },
    },
    {
      id: 'saldo',
      title: 'Історія з Saldo',
      hint: 'Разовий перенос усієї попередньої історії з CSV-експорту. Можна пропустити й почати з чистого аркуша.',
      state: input.saldoImported ? 'done' : 'todo',
      action: {
        kind: 'open',
        title: input.saldoImported ? 'Відкрити імпорт' : 'Імпортувати',
        href: '/manage/saldo-import',
      },
    },
    notificationStep(input.notificationAccess),
  ];
}

/**
 * The permission step, whose whole job is to be honest about three different answers.
 *
 * Every wording says that what is read stays on the phone, because that is the fear this
 * permission raises and the promise the app actually keeps (vision §12): notifications are parsed
 * on the device and nothing leaves it.
 */
function notificationStep(access: NotificationAccess): OnboardingStep {
  // The same explanation and the same offer the «Сповіщення банків» section makes, from the one
  // place that decides them: two copies of a promise are two promises, and only one of them would
  // be under test.
  const section = accessSection(access);
  if (section.grant === undefined) {
    return {
      id: 'notifications',
      title: 'Читання сповіщень банків',
      // No action at all: this build installs no listener, so the app is not even listed on
      // Android's notification-access screen and sending the owner there would send them
      // looking for a switch that is not there.
      hint: `${section.explanation} Поки недоступно в цій збірці.`,
      state: 'unavailable',
    };
  }
  return {
    id: 'notifications',
    title: 'Читання сповіщень банків',
    hint: section.explanation,
    state: access === 'granted' ? 'done' : 'todo',
    action: { kind: 'notification-settings', title: section.grant },
  };
}

/**
 * What the screen says above the list: how much of the setup is behind the owner.
 *
 * The two numbers are separated by «/» and not by a word. The view sets this line in `overline` —
 * uppercase with the letters spaced apart — where «З» is indistinguishable from «3», so «ГОТОВО 2
 * З 4» reads as three numbers. A solidus cannot be read as a digit under any casing, and fixing it
 * here leaves every other section label in the app as it is.
 */
export function onboardingSummary(steps: readonly OnboardingStep[]): string {
  const actionable = steps.filter((step) => step.state !== 'unavailable');
  const done = actionable.filter((step) => step.state === 'done').length;
  return `Готово ${done}/${actionable.length}`;
}
