import { describe, expect, it } from 'vitest';

import { NO_INSTALLMENT_FACTS, type Installment } from '../domain/installments';
import { inMemoryLocalNotifications } from '../platform/local-notifications';
import {
  INSTALLMENT_REMINDER_TIME,
  planInstallmentReminders,
  reassertInstallmentReminders,
} from './installment-schedule';
import { REMINDER_NOTICE, routeOf, noticeData } from './notices';

const iphone: Installment = {
  id: 'i-iphone',
  name: 'iPhone',
  total: 200_000,
  partsCount: 2,
  part: 100_000,
  firstDue: '2026-10-05',
  debitAccountId: 'black',
  paidBefore: 0,
  recordedAt: 1,
};
const vacuum: Installment = { ...iphone, id: 'i-vacuum', name: 'Пилосос', total: 100_000, part: 50_000, recordedAt: 2 };

const morning = { date: '2026-10-01', minuteOfDay: 9 * 60 };

describe('the нагадування про платіж the phone holds', () => {
  it('Scenario: One warning for the day before', async () => {
    const port = inMemoryLocalNotifications();
    await reassertInstallmentReminders(port, {
      installments: [iphone],
      facts: NO_INSTALLMENT_FACTS,
      enabled: true,
      now: morning,
    });

    const held = port.scheduled();
    expect(held[0]).toEqual({ id: 'installment-due-2026-10-04', at: { hour: 10, minute: 0 }, date: '2026-10-04' });
    // The second платіж is warned of too; nothing else.
    expect(held.map((h) => h.date)).toEqual(['2026-10-04', '2026-11-04']);

    const plan = planInstallmentReminders({
      installments: [iphone],
      facts: NO_INSTALLMENT_FACTS,
      enabled: true,
      now: morning,
      permission: 'granted',
      scheduled: [],
    });
    const notice = plan.schedule[0]!.notice;
    for (const word of [notice.title, notice.body]) {
      expect(word).not.toContain('iPhone');
      expect(word).not.toMatch(/\d/);
    }
    expect(routeOf(noticeData(notice))).toBe('/manage/installments');
  });

  it('Scenario: Two платежі on one day give one warning', async () => {
    const port = inMemoryLocalNotifications();
    await reassertInstallmentReminders(port, {
      installments: [iphone, vacuum],
      facts: NO_INSTALLMENT_FACTS,
      enabled: true,
      now: morning,
    });
    expect(port.scheduled().filter((h) => h.date === '2026-10-04')).toHaveLength(1);
  });

  it('Scenario: An early debit withdraws the warning', async () => {
    const onlyOne = { ...iphone, partsCount: 2 };
    const port = inMemoryLocalNotifications();
    await reassertInstallmentReminders(port, {
      installments: [onlyOne],
      facts: NO_INSTALLMENT_FACTS,
      enabled: true,
      now: morning,
    });
    expect(await port.scheduledIds()).toContain('installment-due-2026-10-04');

    // The витрата of 2026-10-03 is linked to the платіж of 2026-10-05.
    await reassertInstallmentReminders(port, {
      installments: [onlyOne],
      facts: { ...NO_INSTALLMENT_FACTS, links: [{ installmentId: iphone.id, number: 1, transactionId: 't' }] },
      enabled: true,
      now: { date: '2026-10-03', minuteOfDay: 12 * 60 },
    });
    expect(await port.scheduledIds()).toEqual(['installment-due-2026-11-04']);
  });

  it('Scenario: Turned off means none', async () => {
    const port = inMemoryLocalNotifications();
    const input = { installments: [iphone, vacuum], facts: NO_INSTALLMENT_FACTS, now: morning };
    await reassertInstallmentReminders(port, { ...input, enabled: true });
    await port.scheduleDaily(REMINDER_NOTICE, { hour: 21, minute: 0 });

    await reassertInstallmentReminders(port, { ...input, enabled: false });

    // None of its own, and the daily нагадування untouched.
    expect(await port.scheduledIds()).toEqual(['reminder']);
  });

  it('holds none on a phone that does not allow notifications, and none for a closed розстрочка', async () => {
    const denied = inMemoryLocalNotifications({ permission: 'denied' });
    await reassertInstallmentReminders(denied, {
      installments: [iphone],
      facts: NO_INSTALLMENT_FACTS,
      enabled: true,
      now: morning,
    });
    expect(denied.scheduled()).toEqual([]);

    const plan = planInstallmentReminders({
      installments: [{ ...iphone, closedOn: '2026-10-01' }],
      facts: NO_INSTALLMENT_FACTS,
      enabled: true,
      now: morning,
      permission: 'granted',
      scheduled: ['installment-due-2026-10-04', 'reminder'],
    });
    expect(plan).toEqual({ cancel: ['installment-due-2026-10-04'], schedule: [] });
  });

  it('arranges at 10:00 and never twice under one id across re-assertions', async () => {
    expect(INSTALLMENT_REMINDER_TIME).toEqual({ hour: 10, minute: 0 });
    const port = inMemoryLocalNotifications();
    const input = { installments: [iphone], facts: NO_INSTALLMENT_FACTS, enabled: true, now: morning };
    await reassertInstallmentReminders(port, input);
    await reassertInstallmentReminders(port, input);
    expect(port.scheduled()).toHaveLength(2);
  });
});
