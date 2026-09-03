import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { account, type Account } from '../domain/account';
import type { Category, Source } from '../domain/category';
import { money } from '../domain/money';
import { expenseByDefault, type Transaction } from '../domain/transaction';
import { inMemoryAnalysisShare } from '../platform/analysis-share';
import {
  aiAnalysisModel,
  defaultChoices,
  fileToShare,
  nextState,
  PERIOD_CHOICES,
  periodChoiceOf,
  REQUEST_HINT_SENTENCE,
  REQUEST_INCLUDED_SENTENCE,
  runOutcomeWords,
  shortRequestToCopy,
  sizeInKb,
  textToCopy,
  type AiAnalysisChoices,
  type RunState,
  type StoredForAnalysis,
} from './ai-analysis-screen';

const accounts: readonly Account[] = [
  account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
];

const categories: readonly Category[] = [
  { id: 'cafe', name: 'Кафе', archived: false },
  { id: 'groceries', name: 'Продукти', archived: false },
];

const sources: readonly Source[] = [{ id: 'salary', name: 'Зарплата', archived: false }];

let seq = 0;
const spend = (date: string, amount = 100000, categoryId = 'cafe', description?: string): Transaction =>
  expenseByDefault({
    id: `t${(seq += 1)}`,
    date,
    accountId: 'card',
    amount: money(amount, 'UAH'),
    categoryId,
    ...(description ? { description } : {}),
  });

function stored(transactions: readonly Transaction[]): StoredForAnalysis {
  return { accounts, transactions, categories, sources, limits: [], goals: [], rates: [] };
}

const TODAY = '2026-09-02';

const history = [
  spend('2026-07-05', 300000, 'groceries'),
  spend('2026-07-10', 100000, 'cafe', 'СІЛЬПО'),
  spend('2026-08-05', 250000, 'groceries'),
  spend('2026-08-11', 150000, 'cafe', 'Aroma Kava'),
  spend('2026-09-01', 50000, 'cafe'),
];

const model = (over: Partial<AiAnalysisChoices> = {}, transactions = history) =>
  aiAnalysisModel({
    choices: { ...defaultChoices(TODAY), ...over },
    stored: stored(transactions),
    today: TODAY,
  });

describe('the choices', () => {
  it('Scenario: The defaults are the least that leaves the phone', () => {
    const choices = defaultChoices(TODAY);

    expect(choices.kind).toBe('monthly-picture');
    expect(choices.period).toBe('last-3');
    expect(choices.descriptions).toBe(false);
    expect(choices.transactions).toBe(false);

    // And the preview is already there, built in memory, with nothing written or handed anywhere.
    const opened = model();
    expect(opened.state).toBe('preview');
    expect(opened.preview).not.toBeNull();
    expect(opened.preview!.handOver).toBe('Ці дані буде передано застосунку, який ви оберете.');
    expect(opened.preview!.descriptions).toBe(false);
    expect(opened.preview!.transactionsIncluded).toBe(false);
  });

  it('offers the five periods, in the owner’s words', () => {
    expect(PERIOD_CHOICES.map((choice) => choice.label)).toEqual([
      'Цей місяць',
      'Останні 3 місяці',
      'Останні 6 місяців',
      'Останні 12 місяців',
      'Свій діапазон',
    ]);
  });

  it('Scenario: A custom range is whole months', () => {
    const custom = model({ period: 'custom', from: '2026-07', to: '2026-08' });

    expect(periodChoiceOf({ ...defaultChoices(TODAY), period: 'custom', from: '2026-07', to: '2026-08' })).toEqual({
      from: '2026-07',
      to: '2026-08',
    });
    expect(custom.period).toMatchObject({ from: '2026-07', to: '2026-08', months: 2 });
  });

  it('Scenario: A custom range that ends before it starts is refused', () => {
    const refused = model({ period: 'custom', from: '2026-08', to: '2026-07' });

    expect(refused.state).toBe('invalid-range');
    expect(refused.message).toBe('Кінець діапазону раніше за його початок.');
    expect(refused.canShare).toBe(false);
    // Nothing was built at all.
    expect(refused.package).toBeNull();
    expect(refused.document).toBeNull();
  });

  it('Scenario: A half-typed month is a sentence, not an exception', () => {
    // The «Від» and «До» fields are text: every keystroke passes through a month that is not one
    // yet. The emulator found this as a red «Render Error: month must be YYYY-MM, got "2026-0"»
    // after a single backspace, which the spec forbids in as many words.
    for (const half of ['2026-0', '2026-', '2026', '', '2026-13', 'серпень']) {
      const typing = model({ period: 'custom', from: half, to: '2026-09' });

      expect(typing.state).toBe('invalid-range');
      expect(typing.message).toBe('Місяць пишеться як РРРР-ММ, напр. 2026-08.');
      expect(typing.canShare).toBe(false);
      expect(typing.package).toBeNull();
    }

    // And the same on the other end of the range.
    expect(model({ period: 'custom', from: '2026-07', to: '2026-1' }).message).toBe(
      'Місяць пишеться як РРРР-ММ, напр. 2026-08.',
    );
    // A whole month on both ends is read normally again, with a preview to share.
    const whole = model({ period: 'custom', from: '2026-07', to: '2026-08' });
    expect(whole.state).toBe('preview');
    expect(whole.canShare).toBe(true);
    expect(whole.message).toBeNull();
  });

  it('never lets a half-typed month reach the month arithmetic', () => {
    // Building the model must not throw, whatever is in the two fields — the crash was a throw
    // out of `partsOf`, three calls below the screen.
    for (const from of ['2026-0', '', '20261', '2026-00']) {
      expect(() => model({ period: 'custom', from, to: '2026-09' })).not.toThrow();
    }
  });

  it('Scenario: Details are not remembered', () => {
    // Turning «Продавці» on is a choice about this run and lives only in React state; a model
    // built afresh — which is what reopening the screen does — has it off again.
    expect(model({ descriptions: true }).preview!.descriptions).toBe(true);
    expect(defaultChoices(TODAY).descriptions).toBe(false);
    expect(model().preview!.descriptions).toBe(false);
  });
});

describe('the preview', () => {
  it('Scenario: The preview counts the пакет', () => {
    const preview = model({ period: 'last-6' }).preview!;

    expect(preview.monthsWithData).toBe(3);
    expect(preview.transactions).toBe(5);
    expect(preview.categories).toBe(2);
    expect(preview.currencies).toEqual(['UAH']);
    expect(preview.summary).toContain('3 місяці');
    expect(preview.summary).toContain('5 транзакцій');
    expect(preview.summary).toContain('2 категорії');
    expect(preview.summary).toContain('продавці: ні');
    expect(preview.summary).toContain('окремі транзакції: ні');
    expect(preview.summary).toContain('КБ');
  });

  it('Scenario: The preview says the request is already inside', () => {
    const preview = model().preview!;

    expect(preview.requestIncluded).toBe(REQUEST_INCLUDED_SENTENCE);
    // A запит is prepared inside the файл along with the numbers…
    expect(preview.requestIncluded).toContain('у файлі вже є запит до асистента');
    expect(preview.requestIncluded).toContain('що зробити з даними');
    expect(preview.requestIncluded).toContain('що означає кожен термін');
    // …and the owner need write nothing themselves.
    expect(preview.requestIncluded).toContain('Писати нічого не треба');
  });

  it('Scenario: The action explains itself before it is used', () => {
    // Standing beside «Скопіювати запит» from the moment it is offered — nothing has been copied
    // and nothing has been handed over.
    const preview = model().preview!;

    expect(preview.requestHint).toBe(REQUEST_HINT_SENTENCE);
    expect(preview.requestHint).toContain('може взяти лише файл');
    expect(preview.requestHint).toContain('надішліть йому цей запит окремим повідомленням');
  });

  it('Scenario: No assistant is named', () => {
    const preview = model().preview!;

    expect(preview.requestHint).toContain('Застосунок, який ви оберете');
    for (const brand of ['ChatGPT', 'GPT', 'Claude', 'Gemini', 'Copilot', 'DeepSeek', 'Grok', 'AI-']) {
      expect(preview.requestHint, `the hint names «${brand}»`).not.toContain(brand);
      expect(preview.requestIncluded, `the sentence names «${brand}»`).not.toContain(brand);
    }
  });

  it('counts the very пакет that would be handed over', () => {
    const built = model({ period: 'last-6' });

    expect(built.preview!.transactions).toBe(built.package!.counts.transactions);
    expect(built.preview!.categories).toBe(built.package!.counts.categories);
    expect(built.preview!.currencies).toEqual(built.package!.counts.currencies);
    expect(built.preview!.sizeKb).toBe(sizeInKb(built.document!.text));
  });

  it('Scenario: The preview follows the choices', () => {
    const closed = model();
    const open = model({ transactions: true });

    expect(open.preview!.transactionsIncluded).toBe(true);
    expect(open.preview!.summary).toContain('окремі транзакції: так');
    // The size grows in bytes, whatever the rounding to kilobytes does.
    const bytes = (text: string) => new TextEncoder().encode(text).length;
    expect(bytes(open.document!.text)).toBeGreaterThan(bytes(closed.document!.text));
  });

  it('measures the size in the bytes that actually leave, not in characters', () => {
    // Cyrillic is two bytes a letter; counting characters would understate the файл by about 40 %.
    const document = model().document!;
    expect(new TextEncoder().encode(document.text).length).toBeGreaterThan(document.text.length);
  });

  it('Scenario: The full text can be read first', () => {
    const built = model();

    // What «Показати файл» shows is the файл itself — not a rendering of a rendering.
    expect(built.document!.text).toContain('# cap1tal · AI-аналіз місячної картини');
    // Opening with the запит, and shown whole — not an extract, a rendering or a summary.
    expect(built.document!.text.split('\n')[2]).toBe('## Запит');
    expect(textToCopy(built)).toBe(built.document!.text);
    expect(fileToShare(built)).toEqual({
      name: built.document!.name,
      text: built.document!.text,
      message: built.document!.shortRequest,
    });
  });
});

describe('the states that offer nothing to share', () => {
  it('Scenario: An empty period offers nothing to share', () => {
    const empty = model({ period: 'custom', from: '2026-01', to: '2026-03' });

    expect(empty.state).toBe('empty-period');
    expect(empty.message).toBe('За цей період транзакцій немає — нема чого аналізувати.');
    expect(empty.canShare).toBe(false);
    expect(empty.document).toBeNull();
    // And nothing to copy: neither the файл nor the короткий запит.
    expect(empty.canCopy).toBe(false);
    expect(textToCopy(empty)).toBeNull();
    expect(shortRequestToCopy(empty)).toBeNull();
  });

  it('Scenario: An empty history leads to the first транзакція', () => {
    const nothing = model({}, []);

    expect(nothing.state).toBe('empty-history');
    expect(nothing.message).toBe('Ще немає жодної транзакції.');
    expect(nothing.canShare).toBe(false);
    // And no «Скопіювати» either: there is no файл to copy.
    expect(nothing.canCopy).toBe(false);
    // Nor the короткий запит — where there is nothing to preview there is nothing to copy.
    expect(textToCopy(nothing)).toBeNull();
    expect(shortRequestToCopy(nothing)).toBeNull();
    expect(nothing.preview).toBeNull();
  });

  it('Scenario: A one-month history is warned, not refused', () => {
    const oneMonth = model({ period: 'last-6' }, [spend('2026-09-01'), spend('2026-09-02')]);

    expect(oneMonth.state).toBe('preview');
    expect(oneMonth.warning).toBe('Один місяць не показує тренду.');
    expect(oneMonth.canShare).toBe(true);
  });

  it('«Цей місяць» always carries the warning, and that is accepted', () => {
    const thisMonth = model({ period: 'this-month' });

    expect(thisMonth.warning).toBe('Один місяць не показує тренду.');
    expect(thisMonth.canShare).toBe(true);
    // A period of more than one month with data carries none.
    expect(model({ period: 'last-3' }).warning).toBeNull();
  });
});

describe('what the screen depends on', () => {
  const screen = readFileSync(new URL('../app/ai-analysis.tsx', import.meta.url), 'utf8');

  it('leads an empty history to the entry form, and that route must exist', () => {
    // «Записати першу» pushes `/transaction/new`. Expo-router would otherwise match that against
    // the dynamic `transaction/[id]` route and open the *editor* of a транзакція whose id reads
    // "new" — the very hazard `_layout.tsx` comments on. The route belongs to another change, so
    // this asserts it is actually here: merging `ai-analysis-share` without it fails loudly under
    // `verify` instead of quietly opening the wrong screen on the phone.
    expect(screen).toContain("router.push('/transaction/new')");
    expect(existsSync(new URL('../app/transaction/new.tsx', import.meta.url))).toBe(true);

    const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
    expect(layout).toContain('name="transaction/new"');
    // And this change's own route is registered beside it.
    expect(layout).toContain('name="ai-analysis"');
  });

  it('decides nothing of its own — every word and state comes from this module', () => {
    // The screen is wiring. Anything it computed itself would be outside `verify`'s reach.
    expect(screen).toContain('aiAnalysisModel');
    expect(screen).toContain('runOutcomeWords');
    expect(screen).toContain('fileToShare');
    expect(screen).toContain('textToCopy');
    expect(screen).toContain('shortRequestToCopy');
    // No сума is formatted there, and no пакет is built there.
    expect(screen).not.toContain('formatMoney');
    expect(screen).not.toContain('buildAnalysisPackage');
  });

  it('gates both copies on the model and not on the state of a run', () => {
    /** The JSX condition the block holding `title="…"` opens with. */
    const gateOf = (title: string): string => {
      const at = screen.indexOf(`title="${title}"`);
      expect(at, `no action titled «${title}»`).toBeGreaterThan(-1);
      const before = screen.slice(0, at);
      return before.slice(before.lastIndexOf('{model.')).split('?')[0]!.trim();
    };

    // Both on `model.canCopy` — «Скопіювати запит» is offered whenever a preview exists, whether
    // or not a chooser is available and whether or not a hand-off has happened. A gate on
    // `run.kind` would fail here.
    expect(gateOf('Скопіювати')).toBe('{model.canCopy');
    expect(gateOf('Скопіювати запит')).toBe('{model.canCopy');
    expect(screen).not.toContain("run.kind === 'preview'");
  });

  it('offers both copies and shows the two new sentences from the model', () => {
    // «Скопіювати запит» beside «Скопіювати», both gated on the one flag, so a hand-off leaves
    // both available.
    expect(screen).toContain('title="Скопіювати запит"');
    expect(screen).toContain('title="Скопіювати"');
    expect(screen).toContain('copyRequest');
    expect(screen).toContain("kind: 'copy-request'");

    // The two sentences are read off the preview and written nowhere in the screen.
    expect(screen).toContain('model.preview.requestIncluded');
    expect(screen).toContain('model.preview.requestHint');
    expect(screen).not.toContain('Писати нічого не треба');
    expect(screen).not.toContain('може взяти лише файл');
  });
});

describe('the run', () => {
  const preview: RunState = { kind: 'preview' };

  it('Scenario: Handed over is all that is claimed', () => {
    const sharing = nextState(preview, { kind: 'share' });
    expect(sharing).toEqual({ kind: 'sharing' });

    const done = nextState(sharing, {
      kind: 'outcome',
      outcome: { kind: 'handed-over', messageIncluded: false },
    });

    expect(done).toEqual({ kind: 'handed-over', messageIncluded: false });
    expect(runOutcomeWords(done)).toBe(
      'Файл передано системі. Що з ним сталося далі, знає лише обраний застосунок.',
    );
    // Never «отримано», «прочитано» or «проаналізовано» — none of which the app can know.
    for (const claim of ['отрим', 'прочит', 'проаналіз', 'відповід']) {
      expect(runOutcomeWords(done)).not.toContain(claim);
    }
  });

  it('Scenario: A запит that did not travel is not claimed', async () => {
    // What every adapter shipped today answers: the файл went to the system, the короткий запит
    // did not. The screen then says nothing whatever about a запит.
    const share = inMemoryAnalysisShare();
    const outcome = await share.share(fileToShare(model())!);

    expect(outcome).toEqual({ kind: 'handed-over', messageIncluded: false });

    const words = runOutcomeWords(nextState({ kind: 'sharing' }, { kind: 'outcome', outcome }))!;

    expect(words).toBe('Файл передано системі. Що з ним сталося далі, знає лише обраний застосунок.');
    for (const claim of ['запит', 'Запит', 'повідомлен']) {
      expect(words).not.toContain(claim);
    }
  });

  it('Scenario: The app does not claim a message it did not send', () => {
    // Every state the screen can be in without the phone having reported a carried запит. None of
    // them may say a request went anywhere.
    const states: RunState[] = [
      { kind: 'handed-over', messageIncluded: false },
      { kind: 'unavailable' },
      { kind: 'failed', reason: 'немає місця на пристрої' },
      { kind: 'copied' },
    ];

    for (const state of states) {
      const words = runOutcomeWords(state) ?? '';

      expect(words.toLowerCase(), `«${words}»`).not.toContain('запит');
      expect(words, `«${words}»`).not.toContain('повідомлен');
    }
  });

  it('Scenario: A запит that travelled is claimed no further than the файл', () => {
    // The one permitted further sentence, and the whole of what may be said: handed to the system.
    // The app learns nothing about the запит that it does not learn about the файл, so it says
    // nothing more about it either.
    const words = runOutcomeWords({ kind: 'handed-over', messageIncluded: true })!;

    expect(words).toContain('передано системі');
    for (const claim of ['надісла', 'достав', 'отрим', 'прочит', 'проаналіз', 'відповід']) {
      expect(words, `claims «${claim}»`).not.toContain(claim);
    }
    // And the file's own claim is unchanged when nothing travelled with it.
    expect(runOutcomeWords({ kind: 'handed-over', messageIncluded: false })).toBe(
      'Файл передано системі. Що з ним сталося далі, знає лише обраний застосунок.',
    );
  });

  it('Scenario: The короткий запит can be copied alone', () => {
    const built = model();

    // Exactly the короткий запит, and not the файл.
    expect(shortRequestToCopy(built)).toBe(built.document!.shortRequest);
    expect(shortRequestToCopy(built)).not.toBe(textToCopy(built));
    // It is not an extract of the файл either — the файл has its own «Запит», in its own words.
    expect(textToCopy(built)).not.toContain(shortRequestToCopy(built)!);
    // And the файл itself never lands on the clipboard through this action.
    expect(shortRequestToCopy(built)!).not.toContain('## Запит');
    expect(shortRequestToCopy(built)!).not.toContain('```json');
  });

  it('Scenario: A запит that travelled is handed over and no more', async () => {
    // The branch no adapter reaches yet, exercised against the double so it is written and proven
    // now rather than the day one does.
    const share = inMemoryAnalysisShare({
      outcome: { kind: 'handed-over', messageIncluded: true },
    });
    const outcome = await share.share(fileToShare(model())!);

    const carried = nextState({ kind: 'sharing' }, { kind: 'outcome', outcome });
    expect(carried).toEqual({ kind: 'handed-over', messageIncluded: true });

    const words = runOutcomeWords(carried)!;
    expect(words).toBe(
      'Файл і запит передано системі. Що з ними сталося далі, знає лише обраний застосунок.',
    );
    // The one permitted further thing, and no further: the app learns none of this about the
    // запит, for exactly the reason it learns none of it about the файл.
    for (const claim of ['надісла', 'достав', 'отрим', 'прочит', 'проаналіз', 'відповід']) {
      expect(words).not.toContain(claim);
    }
  });

  it('Scenario: No way to share on this platform', () => {
    const done = nextState({ kind: 'sharing' }, { kind: 'outcome', outcome: { kind: 'unavailable' } });

    expect(done).toEqual({ kind: 'unavailable' });
    expect(runOutcomeWords(done)).toBe('На цій платформі поділитися файлом не вийде.');
    // And «Скопіювати» is still offered, because the файл still exists.
    expect(model().canCopy).toBe(true);
  });

  it('Scenario: The файл could not be prepared', () => {
    const done = nextState(
      { kind: 'sharing' },
      { kind: 'outcome', outcome: { kind: 'failed', reason: 'немає місця на пристрої' } },
    );

    expect(done).toEqual({ kind: 'failed', reason: 'немає місця на пристрої' });
    expect(runOutcomeWords(done)).toBe('Не вдалося підготувати файл: немає місця на пристрої');
  });

  it('Scenario: Copying puts the same text on the clipboard', async () => {
    const built = model();
    const copied = nextState(preview, { kind: 'copy' });

    expect(copied).toEqual({ kind: 'copied' });
    expect(runOutcomeWords(copied)).toBe('Скопійовано.');
    expect(textToCopy(built)).toBe(built.document!.text);
  });

  it('Scenario: Copy equals the файл', () => {
    const built = model();

    // Character for character: what is copied is the файл, not a rendering of it.
    expect(textToCopy(built)).toBe(fileToShare(built)!.text);
  });

  it('Scenario: The запит is copied in one action', async () => {
    const built = model();
    const share = inMemoryAnalysisShare();

    // What lands on the clipboard is the короткий запит and nothing else…
    expect(shortRequestToCopy(built)).toBe(built.document!.shortRequest);
    expect(shortRequestToCopy(built)).not.toBe(built.document!.text);
    expect(shortRequestToCopy(built)!.length).toBeLessThan(built.document!.text.length);
    // …and it is the very text that would be offered beside the файл.
    expect(shortRequestToCopy(built)).toBe(fileToShare(built)!.message);

    // Nothing was handed to any app by copying.
    const copied = nextState(preview, { kind: 'copy-request' });
    expect(copied).toEqual({ kind: 'copied-request' });
    expect(share.handed()).toEqual([]);

    // And the words claim nothing about sending.
    const words = runOutcomeWords(copied)!;
    expect(words).toBe('Запит у буфері обміну.');
    for (const claim of ['надісла', 'достав', 'отрим', 'прочит', 'передано']) {
      expect(words).not.toContain(claim);
    }
    // The two copy actions are told apart: «Скопійовано.» is the other one's word.
    expect(runOutcomeWords({ kind: 'copied' })).toBe('Скопійовано.');
  });

  it('carries name, text and the короткий запит to the port', async () => {
    const built = model();
    const share = inMemoryAnalysisShare();

    await share.share(fileToShare(built)!);

    expect(share.handed()).toEqual([
      {
        name: built.document!.name,
        text: built.document!.text,
        message: built.document!.shortRequest,
      },
    ]);
  });

  it('refuses copying the запит while a chooser is open, and resets it with a choice', () => {
    expect(nextState({ kind: 'sharing' }, { kind: 'copy-request' })).toEqual({ kind: 'sharing' });
    expect(nextState({ kind: 'copied-request' }, { kind: 'choices-changed' })).toEqual({
      kind: 'preview',
    });
  });

  it('Scenario: Both copies stay available after a hand-off', async () => {
    // Actually hand the файл over first — the state the screen is then showing is what the
    // scenario is about.
    const share = inMemoryAnalysisShare();
    const built = model();
    const outcome = await share.share(fileToShare(built)!);
    const showing = nextState({ kind: 'sharing' }, { kind: 'outcome', outcome });

    expect(showing).toEqual({ kind: 'handed-over', messageIncluded: false });

    // From there both copies still lead somewhere: neither is gated on the run state. A screen
    // that offered them only from `preview` would break the scenario and pass without this.
    expect(nextState(showing, { kind: 'copy' })).toEqual({ kind: 'copied' });
    expect(nextState(showing, { kind: 'copy-request' })).toEqual({ kind: 'copied-request' });

    // And the model still holds both texts to copy.
    expect(built.canCopy).toBe(true);
    expect(textToCopy(built)).not.toBeNull();
    expect(shortRequestToCopy(built)).not.toBeNull();
  });

  it('Scenario: Leaving the screen hands nothing over', async () => {
    const share = inMemoryAnalysisShare();
    const built = model();

    // The model was built, the preview shown, the файл rendered — and the action never performed.
    expect(built.document).not.toBeNull();
    expect(share.handed()).toEqual([]);

    // Only the action hands anything over, and it hands over exactly the файл.
    await share.share(fileToShare(built)!);
    expect(share.handed()).toEqual([
      {
        name: built.document!.name,
        text: built.document!.text,
        message: built.document!.shortRequest,
      },
    ]);
  });

  it('goes back to the preview when a choice changes, but never out of an open chooser', () => {
    expect(
      nextState({ kind: 'handed-over', messageIncluded: false }, { kind: 'choices-changed' }),
    ).toEqual({ kind: 'preview' });
    expect(nextState({ kind: 'sharing' }, { kind: 'choices-changed' })).toEqual({ kind: 'sharing' });
    // And a second share is not started while one chooser is open.
    expect(nextState({ kind: 'sharing' }, { kind: 'share' })).toEqual({ kind: 'sharing' });
  });

  it('says nothing at all while there is nothing to say', () => {
    expect(runOutcomeWords({ kind: 'preview' })).toBeNull();
    expect(runOutcomeWords({ kind: 'sharing' })).toBeNull();
  });
});
