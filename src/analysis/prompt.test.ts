import { describe, expect, it } from 'vitest';

import { CONTEXT, INSTRUCTIONS, REQUEST, SHORT_REQUEST } from './prompt';

/** Every required sentence, asserted by a stable key phrase rather than by its whole wording. */
const holds = (sentences: readonly string[], phrase: string): boolean =>
  sentences.some((sentence) => sentence.includes(phrase));

describe('the запит', () => {
  const request = REQUEST('місячна картина', '2026-06 — 2026-08').join('\n');

  it('Scenario: The request names the task, the kind and the period', () => {
    // What it is, and who it came from.
    expect(request).toContain('пакет фінансових даних із застосунку cap1tal');
    // The ask itself — an analysis and a practical overview of the period.
    expect(request).toContain('Проаналізуй наведені дані');
    expect(request).toContain('практичний фінансовий огляд за цей період');
    // The kind and the period it was given.
    expect(request).toContain('місячна картина за період 2026-06 — 2026-08');
    // And that everything needed is further down in the same файл.
    expect(request).toContain('Усе потрібне є в цьому ж файлі, нижче');
    expect(request).toContain('інструкції');
    expect(request).toContain('визначенням кожного терміна');
    expect(request).toContain('самі дані');
    expect(request).toContain('Шукати щось поза файлом не треба');
  });

  it('names the kind and the period it was given, and no other', () => {
    const other = REQUEST('інвестиції', '2027-01 — 2027-03').join('\n');

    expect(other).toContain('інвестиції за період 2027-01 — 2027-03');
    expect(other).not.toContain('місячна картина');
    expect(other).not.toContain('2026');
  });

  it('Scenario: The request asks for nothing the instructions forbid', () => {
    // The запит is the first thing a model reads, so it must not pull toward what `INSTRUCTIONS`
    // then forbids. It asks for the data below it to be analysed — never for a forecast, a figure
    // the assistant works out itself, or a recommendation presented as a finding.
    const lowered = request.toLowerCase();
    for (const forbidden of [
      'прогноз',
      'спрогноз',
      'передбач',
      'порахуй',
      'обчисли',
      'підрахуй',
      'підсумуй',
      'оціни',
      'порада',
      'порадь',
    ]) {
      expect(lowered, `the запит asks for «${forbidden}»`).not.toContain(forbidden);
    }
    expect(request).toContain('Проаналізуй наведені дані');
  });

  it('Scenario: The request adds no number', () => {
    // The period is the only figure the запит may carry. The app's own name carries a digit of
    // its own — «cap1tal» — and that is a name, not a number, so both are removed before looking.
    const withoutPeriod = request.split('2026-06 — 2026-08').join('').split('cap1tal').join('');

    expect(withoutPeriod).not.toMatch(/\d/);
  });
});

describe('the короткий запит', () => {
  it('Scenario: The message says nothing the файл does not', () => {
    // It asks for the attached файл to be analysed…
    expect(SHORT_REQUEST).toContain('Проаналізуй');
    expect(SHORT_REQUEST).toContain('прикріплений файл cap1tal');
    // …and says the файл itself holds the context, the definitions and the instructions.
    expect(SHORT_REQUEST).toContain('у самому файлі є повний контекст');
    expect(SHORT_REQUEST).toContain('визначення термінів');
    expect(SHORT_REQUEST).toContain('інструкції');
  });

  it('carries no сума, no категорія and no period', () => {
    // No figure at all: not a period, not a count, not a сума. «cap1tal» is a name, not a number.
    expect(SHORT_REQUEST.split('cap1tal').join('')).not.toMatch(/\d/);
    expect(SHORT_REQUEST).not.toMatch(/\d{4}-\d{2}/);
    for (const category of ['Кафе', 'Продукти', 'Житло', 'категорі']) {
      expect(SHORT_REQUEST).not.toContain(category);
    }
    // And it is short enough to be a message rather than a second файл.
    expect(SHORT_REQUEST.length).toBeLessThan(300);
  });

  it('names no assistant, brand or app', () => {
    for (const brand of ['ChatGPT', 'GPT', 'Claude', 'Gemini', 'Copilot', 'DeepSeek', 'Grok']) {
      expect(SHORT_REQUEST).not.toContain(brand);
    }
  });
});

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

  it('Scenario: The instructions name what is worth looking at', () => {
    const instructions = INSTRUCTIONS['external-advanced'];

    expect(holds(instructions, 'зміни від місяця до місяця')).toBe(true);
    expect(holds(instructions, 'найбільші категорії за період')).toBe(true);
    expect(holds(instructions, 'виділяються на тлі попередніх місяців')).toBe(true);
    expect(holds(instructions, 'ліміти')).toBe(true);
    expect(holds(instructions, 'цілі')).toBe(true);
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
  it('Scenario: The context defines a ліміт and a ціль', () => {
    // The instruction section points the answer at both, so the файл has to define both — a файл
    // that instructs attention to a term it never defines is not self-contained.
    expect(holds(CONTEXT, 'Ліміт — місячна стеля витрат на одну категорію')).toBe(true);
    expect(holds(CONTEXT, 'у власній валюті ліміту')).toBe(true);
    expect(holds(CONTEXT, 'рівність — не перевищення')).toBe(true);
    expect(holds(CONTEXT, 'ні враховуються в ліміт, ні конвертуються')).toBe(true);

    expect(holds(CONTEXT, 'прогрес — це розрахунковий баланс прив’язаного рахунку')).toBe(true);
    expect(holds(CONTEXT, 'у валюті того рахунку і без жодної конвертації')).toBe(true);
    expect(holds(CONTEXT, 'досягнута')).toBe(true);
    expect(holds(CONTEXT, 'прострочена')).toBe(true);
  });

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
