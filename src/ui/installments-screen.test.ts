import { describe, expect, it } from 'vitest';

import { NO_INSTALLMENT_FACTS, type Installment } from '../domain/installments';
import { inMemoryLocalNotifications } from '../platform/local-notifications';
import {
  INSTALLMENTS_EMPTY,
  askOnceForReminders,
  installmentList,
  reminderLine,
  setRemindersOn,
  type InstallmentReminderSwitchStorage,
} from './installments-screen';

const NOW = new Date(2026, 9, 1, 12);

const iphone: Installment = {
  id: 'i-iphone',
  name: 'iPhone',
  total: 1_000_000,
  partsCount: 10,
  part: 100_000,
  firstDue: '2026-06-05',
  debitAccountId: 'black',
  paidBefore: 4,
  recordedAt: 2,
};
const vacuum: Installment = {
  id: 'i-vacuum',
  name: 'Пилосос',
  total: 150_000,
  partsCount: 3,
  part: 50_000,
  firstDue: '2026-10-20',
  debitAccountId: 'black',
  paidBefore: 0,
  recordedAt: 1,
};

describe('the list of розстрочки', () => {
  it('Scenario: The nearest платіж leads', () => {
    const list = installmentList([vacuum, iphone], NO_INSTALLMENT_FACTS, NOW);
    expect(list.active.map((row) => row.name)).toEqual(['iPhone', 'Пилосос']);
    expect(list.active[0]).toEqual({
      id: 'i-iphone',
      name: 'iPhone',
      progress: '4 з 10',
      remaining: '6 000,00 ₴',
      next: '5 жовт. · 1 000,00 ₴',
    });
  });

  it('Scenario: A missed debit is visible from the list', () => {
    const list = installmentList([iphone], NO_INSTALLMENT_FACTS, new Date(2026, 9, 9, 12));
    expect(list.active[0]?.missed).toBe('Списання не знайдено');
  });

  it('Scenario: Paid-off ones are set apart', () => {
    const earbuds: Installment = { ...vacuum, id: 'i-earbuds', name: 'Навушники', firstDue: '2026-07-05' };
    const facts = {
      ...NO_INSTALLMENT_FACTS,
      marks: [1, 2, 3].map((number) => ({ installmentId: 'i-earbuds', number })),
    };
    const list = installmentList([earbuds, iphone], facts, NOW);
    expect(list.active.map((row) => row.name)).toEqual(['iPhone']);
    expect(list.closed.map((row) => row.name)).toEqual(['Навушники']);
    // Closed early sits there too, and says so.
    const closedEarly = installmentList([{ ...iphone, closedOn: '2026-10-01' }], NO_INSTALLMENT_FACTS, NOW);
    expect(closedEarly.closed[0]).toMatchObject({ name: 'iPhone', closedEarly: true, remaining: '0,00 ₴' });
  });

  it('Scenario: An empty screen explains itself', () => {
    const list = installmentList([], NO_INSTALLMENT_FACTS, NOW);
    expect(list).toEqual({ active: [], closed: [], empty: INSTALLMENTS_EMPTY });
    // One sentence.
    expect(INSTALLMENTS_EMPTY.match(/[.!?]/g)).toHaveLength(1);
  });
});

function switchStorage(start = { enabled: true, asked: false }): InstallmentReminderSwitchStorage {
  let state = { ...start };
  return {
    reminder: () => state,
    setReminderEnabled: (enabled) => {
      state = { ...state, enabled };
    },
    markAsked: () => {
      state = { ...state, asked: true };
    },
  };
}

describe('the switch of the нагадування про платіж', () => {
  it('Scenario: The first розстрочка asks once', async () => {
    const phone = inMemoryLocalNotifications({ permission: 'denied' });
    const storage = switchStorage();
    // Storing the first розстрочка, then a second.
    await askOnceForReminders({ notifications: phone, storage });
    await askOnceForReminders({ notifications: phone, storage });
    expect(phone.asked()).toBe(1);
    // Turning the switch off and on again does not ask a second time either.
    await setRemindersOn(false, { notifications: phone, storage });
    await setRemindersOn(true, { notifications: phone, storage });
    expect(phone.asked()).toBe(1);
  });

  it('asks when the switch is turned on, while the app has never asked', async () => {
    const phone = inMemoryLocalNotifications({ permission: 'denied', answer: 'granted' });
    const storage = switchStorage({ enabled: false, asked: false });
    await askOnceForReminders({ notifications: phone, storage });
    expect(phone.asked()).toBe(0);
    expect(await setRemindersOn(true, { notifications: phone, storage })).toBe('granted');
    expect(phone.asked()).toBe(1);
  });

  it('Scenario: A phone that already allows it is not asked', async () => {
    const phone = inMemoryLocalNotifications({ permission: 'granted' });
    const storage = switchStorage();
    await askOnceForReminders({ notifications: phone, storage });
    expect(phone.asked()).toBe(0);
    expect(storage.reminder().asked).toBe(false);
  });

  it('Scenario: A refused permission is said, not hidden', () => {
    expect(reminderLine(true, 'denied')).toEqual({
      text: 'Телефон не дозволяє застосунку сповіщення — нагадування про платіж не прийдуть.',
      offerSettings: true,
    });
    expect(reminderLine(true, 'granted')).toEqual({ offerSettings: false });
    expect(reminderLine(false, 'denied')).toEqual({ offerSettings: false });
  });

  it('Scenario: A build that cannot notify says so', () => {
    const line = reminderLine(true, 'unsupported');
    expect(line.offerSettings).toBe(false);
    expect(line.text).toContain('не прийдуть');
  });
});
