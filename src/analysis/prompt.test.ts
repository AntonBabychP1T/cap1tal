import { describe, expect, it } from 'vitest';

import { CONTEXT, INSTRUCTIONS } from './prompt';

/** Every required sentence, asserted by a stable key phrase rather than by its whole wording. */
const holds = (sentences: readonly string[], phrase: string): boolean =>
  sentences.some((sentence) => sentence.includes(phrase));

describe('the instructions', () => {
  it('Scenario: The instructions forbid what the assistant must not do', () => {
    const instructions = INSTRUCTIONS['external-advanced'];

    // Use only the data given.
    expect(holds(instructions, 'лише даними з цього файлу')).toBe(true);
    // Never invent a number, a категорія, a транзакція or a currency.
    expect(holds(instructions, 'Не вигадуй жодного числа')).toBe(true);
    expect(holds(instructions, 'жодної категорії')).toBe(true);
    expect(holds(instructions, 'жодної транзакції')).toBe(true);
    expect(holds(instructions, 'жодної валюти')).toBe(true);
    // Never recompute.
    expect(holds(instructions, 'Не перераховуй')).toBe(true);
    // Never combine currencies.
    expect(holds(instructions, 'не конвертуй і не порівнюй суми різних валют')).toBe(true);
    // Facts apart from assumptions, and every recommendation marked as one.
    expect(holds(instructions, 'Відокремлюй факти від припущень')).toBe(true);
    expect(holds(instructions, 'позначай як рекомендацію')).toBe(true);
    // The partial month is partial.
    expect(holds(instructions, 'частковий (partial)')).toBe(true);
    // No forecast.
    expect(holds(instructions, 'Не роби прогнозів')).toBe(true);
    // In Ukrainian.
    expect(holds(instructions, 'Відповідай українською')).toBe(true);
  });

  it('asks for the seven-part answer, in that order', () => {
    const instructions = INSTRUCTIONS['external-advanced'];

    expect(holds(instructions, 'із семи частин')).toBe(true);
    const shape = instructions.find((sentence) => sentence.includes('із семи частин'))!;
    for (const part of ['(1)', '(2)', '(3)', '(4)', '(5)', '(6)', '(7)']) {
      expect(shape).toContain(part);
    }
    expect(shape).toContain('коротко про ситуацію');
    expect(shape).toContain('категорії, що помітно зросли');
    expect(shape).toContain('наскільки стабільні відкладено та інвестовано');
    expect(shape).toContain('три-п’ять конкретних речей');
    // Interpreting, not repeating.
    expect(holds(instructions, 'не переказуй таблицю')).toBe(true);
  });

  it('has one profile today, and it is the external one', () => {
    expect(Object.keys(INSTRUCTIONS)).toEqual(['external-advanced']);
  });
});

describe('the context', () => {
  it('Scenario: The context defines the month', () => {
    // The six numbers, each defined.
    for (const phrase of [
      'Витрачено —',
      'Дохід —',
      'Інвестовано —',
      'Відкладено —',
      'Позичено —',
      'Залишилось —',
    ]) {
      expect(holds(CONTEXT, phrase)).toBe(true);
    }
    // The identity.
    expect(holds(CONTEXT, 'дохід − витрачено − інвестовано − відкладено − позичено')).toBe(true);
    expect(
      holds(CONTEXT, 'дохід = витрачено + інвестовано + відкладено + позичено + залишилось'),
    ).toBe(true);
  });

  it('states the five distinctions the data relies on', () => {
    expect(holds(CONTEXT, 'Переказ між власними рахунками — не витрата')).toBe(true);
    expect(holds(CONTEXT, 'Інвестиція — не витрата')).toBe(true);
    expect(holds(CONTEXT, 'Повернення — не дохід')).toBe(true);
    expect(holds(CONTEXT, 'Коригування')).toBe(true);
    expect(holds(CONTEXT, 'непояснені гроші')).toBe(true);
    expect(holds(CONTEXT, 'жодне число не поєднує валюти')).toBe(true);
  });

  it('explains the partial month, the basis points, `null` and the shape of a сума', () => {
    expect(holds(CONTEXT, 'Частковий місяць (partial: true)')).toBe(true);
    expect(holds(CONTEXT, 'базисних пунктах')).toBe(true);
    expect(holds(CONTEXT, '2500 означає 25,00 %')).toBe(true);
    expect(holds(CONTEXT, 'null означає, що числа немає')).toBe(true);
    expect(holds(CONTEXT, 'Це не нуль')).toBe(true);
    expect(holds(CONTEXT, '"amount": "4125.34"')).toBe(true);
  });

  it('names the one figure that crosses currencies as approximate and dated', () => {
    expect(holds(CONTEXT, 'приблизно в гривні')).toBe(true);
    expect(holds(CONTEXT, 'дату') || holds(CONTEXT, 'дата курсу')).toBe(true);
  });
});
