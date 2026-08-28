import { describe, expect, it } from 'vitest';

import type { NotificationAccess } from '../platform/notification-access';
import { firstRun, onboardingSteps, onboardingSummary, type OnboardingStep } from './onboarding';

/**
 * «Перші кроки» without its JSX. Nothing here loads a screen, a repository or a native module —
 * the checklist is data, and this is where the spec holds it to what it offers.
 */

const steps = (over: Partial<Parameters<typeof onboardingSteps>[0]> = {}) =>
  onboardingSteps({
    accounts: 0,
    monobankConfigured: false,
    saldoImported: false,
    notificationAccess: 'unsupported',
    ...over,
  });

const byId = (all: readonly OnboardingStep[], id: OnboardingStep['id']) => {
  const found = all.find((step) => step.id === id);
  if (!found) {
    throw new Error(`no step ${id}`);
  }
  return found;
};

describe('where a launch lands', () => {
  it('Scenario: A fresh install lands on setup', () => {
    expect(firstRun({ accounts: 0, transactions: 0 })).toBe(true);
  });

  it('Scenario: A device in use lands where it always did', () => {
    // Either one is enough: a рахунок means the «+» works, a транзакція means it already did.
    expect(firstRun({ accounts: 1, transactions: 0 })).toBe(false);
    expect(firstRun({ accounts: 0, transactions: 1 })).toBe(false);
    expect(firstRun({ accounts: 3, transactions: 188 })).toBe(false);
  });
});

describe('the setup steps', () => {
  it('Offers every step the app needs, in the order they are worth doing', () => {
    expect(steps().map((step) => step.id)).toEqual([
      'account',
      'monobank',
      'saldo',
      'notifications',
    ]);
  });

  it('Scenario: A finished step reads as finished', () => {
    const all = steps({ accounts: 2, monobankConfigured: true });

    expect(byId(all, 'account').state).toBe('done');
    expect(byId(all, 'monobank').state).toBe('done');
    // Done does not mean closed: the screen that made it done is still one tap away.
    expect(byId(all, 'monobank').action?.kind).toBe('open');
  });

  it('Scenario: An outstanding step leads to one screen', () => {
    const saldo = byId(steps(), 'saldo');

    expect(saldo.state).toBe('todo');
    expect(saldo.action).toEqual({
      kind: 'open',
      title: 'Імпортувати',
      href: '/manage/saldo-import',
    });
  });

  it('A committed import reads as done', () => {
    expect(byId(steps({ saldoImported: true }), 'saldo').state).toBe('done');
  });

  it('Every step offers exactly one action, or none at all', () => {
    for (const access of ['granted', 'denied', 'unsupported'] as NotificationAccess[]) {
      for (const step of steps({ notificationAccess: access })) {
        expect(step.action === undefined).toBe(step.state === 'unavailable');
      }
    }
  });

  it('Counts only what the owner can actually do', () => {
    // The unavailable step is not a step the owner is failing at, so it is not in the total.
    expect(onboardingSummary(steps())).toBe('Готово 0 з 3');
    expect(
      onboardingSummary(steps({ accounts: 1, monobankConfigured: true, saldoImported: true })),
    ).toBe('Готово 3 з 3');
    expect(onboardingSummary(steps({ accounts: 1, notificationAccess: 'granted' }))).toBe(
      'Готово 2 з 4',
    );
  });
});

describe('the notification permission step', () => {
  const notifications = (access: NotificationAccess) =>
    byId(steps({ notificationAccess: access }), 'notifications');

  it('Scenario: An unsupported build says so instead of pointing nowhere', () => {
    const step = notifications('unsupported');

    expect(step.state).toBe('unavailable');
    expect(step.action).toBeUndefined();
    expect(step.hint).toContain('Поки недоступно');
  });

  it('Scenario: A grantable permission offers the system screen', () => {
    const step = notifications('denied');

    expect(step.state).toBe('todo');
    expect(step.action).toEqual({ kind: 'notification-settings', title: 'Надати доступ' });
  });

  it('Scenario: A granted permission reads as done', () => {
    expect(notifications('granted').state).toBe('done');
  });

  it('Says the reading stays on the phone, whatever the answer', () => {
    // The promise this permission has to make before it is asked for (vision §12).
    for (const access of ['granted', 'denied', 'unsupported'] as NotificationAccess[]) {
      expect(notifications(access).hint).toContain('не залишає пристрій');
    }
  });
});
