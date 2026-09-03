import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import type { Category } from '../domain/category';
import type { AccumulationGoal } from '../domain/goals';
import type { CategoryLimit } from '../domain/limits';
import { money } from '../domain/money';
import {
  accumulationFromDraft,
  deleteGoalConfirmation,
  goalAccountChoices,
  goalRows,
  spendingFromDraft,
  spendingGoalCategoryChoices,
  spendingGoalRows,
  targetAfterCurrencyChange,
  tickedLabel,
  tickKind,
  toggleAccount,
  GOAL_KIND_CHOICES,
  type AccumulationDraft,
} from './goals-section';

const jar = account({ id: 'jar', name: 'Резерв', kind: 'savings', currency: 'UAH' });
const cash = account({ id: 'cash', name: 'Готівка', kind: 'cash', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'USD банка', kind: 'savings', currency: 'USD' });
const bonds = account({ id: 'bonds', name: 'ОВДП', kind: 'investment', currency: 'UAH' });
const inzhur = account({ id: 'inzhur', name: 'Inzhur', kind: 'investment', currency: 'UAH' });
const ACCOUNTS = [jar, cash, dollars, bonds, inzhur];

const draft = (over: Partial<AccumulationDraft> = {}): AccumulationDraft => ({
  name: 'Машина',
  target: '700000',
  currency: 'UAH',
  deadline: '2027-06-30',
  accountIds: ['jar'],
  ...over,
});

describe('the kind is asked first', () => {
  it('Scenario: The kind is asked before anything else', () => {
    // Two named choices, and nothing of either form until one is chosen: the section cannot show a
    // сума, категорія, дата or рахунок without knowing which kind it belongs to.
    expect(GOAL_KIND_CHOICES).toEqual([
      { value: 'accumulation', label: 'Накопичити' },
      { value: 'spending', label: 'Не перевищити витрати' },
    ]);
  });

  it('Scenario: The kind of an existing ціль is not offered for change', () => {
    // The two drafts are separate types with no field in common beyond a сума and a currency, so
    // an existing ціль is edited through its own one and cannot be retyped into the other.
    const existing: AccumulationDraft = draft();
    expect('categoryId' in existing).toBe(false);
    expect(() => accumulationFromDraft(existing, { id: 'g', accounts: ACCOUNTS })).not.toThrow();
  });
});

describe('accumulationFromDraft', () => {
  it('Scenario: A created ціль appears in the list', () => {
    const goal = accumulationFromDraft(
      draft({ accountIds: ['jar', 'cash', 'usd'] }),
      { id: 'g-machine', accounts: ACCOUNTS },
    );

    expect(goal).toEqual({
      id: 'g-machine',
      name: 'Машина',
      target: money(70000000, 'UAH'),
      deadline: '2027-06-30',
      accountIds: ['jar', 'cash', 'usd'],
    });
    expect(goalRows([goal], ACCOUNTS)[0]).toMatchObject({
      name: 'Машина',
      target: '700 000,00 UAH',
      deadline: '2027-06-30',
      accountNames: ['Резерв', 'Готівка', 'USD банка'],
    });
  });

  it('Scenario: A ціль-накопичення without a дата is accepted', () => {
    const goal = accumulationFromDraft(
      draft({ name: 'Резерв', target: '300000', deadline: '   ' }),
      { id: 'g-reserve', accounts: ACCOUNTS },
    );

    expect(goal.deadline).toBeUndefined();
    expect('deadline' in goal).toBe(false);
    expect(goalRows([goal], ACCOUNTS)[0]?.deadline).toBeNull();
  });

  it('Scenario: A mixed-currency склад outside UAH is refused in the owner’s language', () => {
    expect(() =>
      accumulationFromDraft(draft({ currency: 'USD', accountIds: ['usd', 'jar'] }), {
        id: 'g',
        accounts: ACCOUNTS,
      }),
    ).toThrow('Рахунки цілі — у різних валютах (USD, UAH), тож ціль може бути тільки в UAH');
  });

  it('Scenario: A ціль-накопичення with no рахунок is refused', () => {
    expect(() =>
      accumulationFromDraft(draft({ accountIds: [] }), { id: 'g', accounts: ACCOUNTS }),
    ).toThrow('Ціль потребує хоча б одного рахунку');
  });

  it('A ціль in a currency neither UAH nor its склад’s is refused', () => {
    expect(() =>
      accumulationFromDraft(draft({ currency: 'EUR', accountIds: ['usd'] }), {
        id: 'g',
        accounts: ACCOUNTS,
      }),
    ).toThrow('Рахунки цілі — у USD, тож ціль може бути тільки в USD або в UAH');
  });

  it('A UAH ціль over several currencies is accepted, and a single-currency ціль keeps its own', () => {
    expect(() =>
      accumulationFromDraft(draft({ accountIds: ['jar', 'usd'] }), { id: 'g', accounts: ACCOUNTS }),
    ).not.toThrow();
    expect(
      accumulationFromDraft(draft({ currency: 'USD', target: '2000', accountIds: ['usd'] }), {
        id: 'g',
        accounts: ACCOUNTS,
      }).target,
    ).toEqual(money(200000, 'USD'));
  });

  it('An empty назва, a non-positive target and a date that is not one are refused', () => {
    const at = { id: 'g', accounts: ACCOUNTS };
    expect(() => accumulationFromDraft(draft({ name: '   ' }), at)).toThrow('Ціль потребує назви');
    expect(() => accumulationFromDraft(draft({ target: '0' }), at)).toThrow();
    expect(() => accumulationFromDraft(draft({ deadline: '30.06.2027' }), at)).toThrow(/РРРР-ММ-ДД/);
    expect(() => accumulationFromDraft(draft({ accountIds: ['ghost'] }), at)).toThrow(
      'Такого рахунку немає',
    );
  });

  it('Scenario: Choosing a рахунок twice counts it once', () => {
    const goal = accumulationFromDraft(draft({ accountIds: ['jar', 'cash', 'jar'] }), {
      id: 'g',
      accounts: ACCOUNTS,
    });

    expect(goal.accountIds).toEqual(['jar', 'cash']);
  });
});

describe('the склад picker', () => {
  it('Scenario: A shortcut ticks the рахунки of its вид', () => {
    const ticked = tickKind([], ACCOUNTS, 'investment');

    expect(ticked).toEqual(['bonds', 'inzhur']);
    expect(tickedLabel(ticked)).toBe('Вибрано 2 рахунки');
  });

  it('Scenario: A рахунок created later does not join a ціль', () => {
    // The shortcut ticked what stood at that moment, and what is stored is those ids.
    const ticked = tickKind([], ACCOUNTS, 'investment');
    const third = account({ id: 'ibkr', name: 'IBKR', kind: 'investment', currency: 'UAH' });
    const goal = accumulationFromDraft(draft({ accountIds: ticked }), {
      id: 'g',
      accounts: [...ACCOUNTS, third],
    });

    expect(goal.accountIds).toEqual(['bonds', 'inzhur']);
    // Taking the shortcut again is what would add the fourth — nothing does it silently.
    expect(tickKind(goal.accountIds, [...ACCOUNTS, third], 'investment')).toEqual([
      'bonds',
      'inzhur',
      'ibkr',
    ]);
  });

  it('Scenario: An archived рахунок is not offered for a new ціль', () => {
    const archived = account({ ...cash, archived: true });
    const accounts = [jar, archived, dollars, bonds, inzhur];

    expect(goalAccountChoices(accounts).map((a) => a.id)).not.toContain('cash');
    // …while an existing ціль holding it keeps it ticked and listed.
    expect(goalAccountChoices(accounts, ['cash']).map((a) => a.id)).toContain('cash');
    // And a shortcut is a way to tick what is current, not a way to resurrect an archive.
    expect(tickKind([], accounts, 'cash')).toEqual([]);
  });

  it('Scenario: Archiving a рахунок leaves the ціль as it was', () => {
    const goal: AccumulationGoal = {
      id: 'g',
      name: 'Машина',
      target: money(70000000, 'UAH'),
      accountIds: ['jar', 'cash'],
    };
    const accounts = [jar, account({ ...cash, archived: true }), dollars];

    const row = goalRows([goal], accounts)[0]!;
    expect(row.accountNames).toEqual(['Резерв', 'Готівка']);
    expect(row.hasArchivedAccount).toBe(true);
  });

  it('Ticking is a set: a second tick removes, and the count says how many', () => {
    expect(toggleAccount([], 'jar')).toEqual(['jar']);
    expect(toggleAccount(['jar', 'cash'], 'jar')).toEqual(['cash']);
    expect(toggleAccount(['jar'], 'jar')).toEqual([]);
    expect(tickedLabel([])).toBe('Жодного рахунку');
    expect(tickedLabel(['jar'])).toBe('Вибрано 1 рахунок');
    expect(tickedLabel(['a', 'b', 'c', 'd', 'e'])).toBe('Вибрано 5 рахунків');
  });

  it('A склад of more than three рахунки is summarised rather than spelled out', () => {
    const goal: AccumulationGoal = {
      id: 'g',
      name: 'Машина',
      target: money(70000000, 'UAH'),
      accountIds: ['jar', 'cash', 'usd', 'bonds'],
    };

    const row = goalRows([goal], ACCOUNTS)[0]!;
    expect(row.accountSummary).toBe('4 рахунки');
    expect(row.accountNames).toEqual([]);
  });
});

describe('editing', () => {
  it('Scenario: Re-linking to another currency asks the target anew', () => {
    expect(targetAfterCurrencyChange('700000', 'UAH', 'USD')).toBe('');
    expect(targetAfterCurrencyChange('700000', 'UAH', 'UAH')).toBe('700000');
  });

  it('Scenario: A рахунок added to the склад starts counting', () => {
    const goal = accumulationFromDraft(draft({ accountIds: toggleAccount(['jar'], 'cash') }), {
      id: 'g',
      accounts: ACCOUNTS,
    });

    expect(goal.accountIds).toEqual(['jar', 'cash']);
  });

  it('Scenario: A рахунок removed from the склад stops counting and keeps its money', () => {
    const goal = accumulationFromDraft(
      draft({ accountIds: toggleAccount(['jar', 'cash'], 'cash') }),
      { id: 'g', accounts: ACCOUNTS },
    );

    // The склад simply stops naming it; nothing here touches a транзакція or a баланс.
    expect(goal.accountIds).toEqual(['jar']);
  });

  it('Scenario: A дата can be removed and added', () => {
    const cleared = accumulationFromDraft(draft({ deadline: '' }), { id: 'g', accounts: ACCOUNTS });
    expect(cleared.deadline).toBeUndefined();

    const given = accumulationFromDraft(draft({ deadline: '2028-01-31' }), {
      id: 'g',
      accounts: ACCOUNTS,
    });
    expect(given.deadline).toBe('2028-01-31');
  });

  it('Scenario: Deleting a ціль витрат clears its ліміт', () => {
    const rows = spendingGoalRows({
      limits: [{ categoryId: 'restaurants', amount: money(200000, 'UAH') }],
      categories: [{ id: 'restaurants', name: 'Ресторани', archived: false }],
    });

    expect(deleteGoalConfirmation(rows[0]!)).toContain('зніме ліміт цієї категорії');
    expect(deleteGoalConfirmation(rows[0]!)).toContain('лишаться такими, як були');
  });

  it('Deleting a ціль-накопичення says the рахунки are untouched', () => {
    const goal: AccumulationGoal = {
      id: 'g',
      name: 'Машина',
      target: money(70000000, 'UAH'),
      accountIds: ['jar'],
    };

    expect(deleteGoalConfirmation(goalRows([goal], ACCOUNTS)[0]!)).toBe(
      'Видалити ціль «Машина»? Рахунки і їхні транзакції лишаться недоторканими.',
    );
  });
});

describe('the ціль витрат half of the section', () => {
  const categories: Category[] = [
    { id: 'restaurants', name: 'Ресторани', archived: false },
    { id: 'groceries', name: 'Продукти', archived: false },
    { id: 'pets', name: 'Тварини', archived: true },
  ];
  const limits: CategoryLimit[] = [{ categoryId: 'groceries', amount: money(1000000, 'UAH') }];

  it('Scenario: A created ціль витрат shows no накопичення fields', () => {
    const limit = spendingFromDraft({ categoryId: 'restaurants', amount: '2000', currency: 'UAH' });

    // A ліміт, and nothing else: no назва, no дата, no рахунок — it is the категорія's ceiling.
    expect(limit).toEqual({ categoryId: 'restaurants', amount: money(200000, 'UAH') });
    expect(Object.keys(limit).sort()).toEqual(['amount', 'categoryId']);
  });

  it('Scenario: A категорія that already carries a ліміт is not offered', () => {
    const offered = spendingGoalCategoryChoices({ categories, limits }).map((c) => c.id);

    expect(offered).toEqual(['restaurants']);
    // Its ціль витрат already exists and is edited from the list instead.
    expect(offered).not.toContain('groceries');
    // An archived категорія is offered nothing new either.
    expect(offered).not.toContain('pets');
  });

  it('Scenario: A ціль витрат of an archived категорія is listed, set apart', () => {
    const rows = spendingGoalRows({
      limits: [...limits, { categoryId: 'pets', amount: money(100000, 'UAH') }],
      categories,
    });

    expect(rows.map((row) => ({ name: row.name, archived: row.archived }))).toEqual([
      { name: 'Продукти', archived: false },
      // Listed, not hidden, and after the rest — so a leftover ceiling can be cleared from here.
      { name: 'Тварини', archived: true },
    ]);
  });

  it('A ціль витрат row says its ceiling and that its period is the calendar month', () => {
    const row = spendingGoalRows({ limits, categories })[0]!;

    expect(row).toEqual({
      kind: 'spending',
      categoryId: 'groceries',
      name: 'Продукти',
      ceiling: '10 000,00 UAH',
      period: 'Календарний місяць',
      archived: false,
    });
  });

  it('A ціль витрат without a категорія, or with a сума that is not one, is refused', () => {
    expect(() => spendingFromDraft({ amount: '2000', currency: 'UAH' })).toThrow(
      'Ціль витрат потребує категорії',
    );
    expect(() =>
      spendingFromDraft({ categoryId: 'restaurants', amount: '0', currency: 'UAH' }),
    ).toThrow();
  });
});
