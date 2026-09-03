/**
 * What the файл tells the assistant before it shows it a single number: what to do with the data,
 * and what every word in it means.
 *
 * The prompt is data — arrays of sentences the renderer joins — and not a template with holes. The
 * one place it stops being constant is the запит, which names the kind and the period of the пакет
 * it opens and nothing else; everywhere else nothing is computed and nothing depends on the пакет.
 * A change to the wording is a change to these arrays and to the golden files beside them, which is
 * exactly how deliberate a change to what leaves the phone should be.
 *
 * Ukrainian, because the app is: the owner reads the файл before it goes anywhere, and an answer
 * they have to translate back is not an answer they asked for.
 *
 * The instructions are stricter than they need to be for a large model, and that is on purpose.
 * The one failure that matters is an assistant that computes — a total it added up itself, a
 * percentage it estimated, two currencies it summed — because such a number looks exactly like the
 * app's own and the owner has no way to tell them apart. So: use what is given, never recompute,
 * never combine currencies, never invent.
 */

/** Phase 2 adds `'local-basic'`: the same пакет, shorter and stricter, for a small local model. */
export type PromptProfile = 'external-advanced';

/**
 * The запит: the first section of the файл, and the only part of the prompt that is not constant.
 *
 * A файл handed to another app arrives as an attachment — what the receiving app shows is a name,
 * and what an assistant reads first is the top of the файл. A файл that opened with an identifier
 * and a version had not asked for anything, and the owner had to type the request themselves,
 * which is the manual step this feature exists to remove.
 *
 * Two words are the пакет's own — the kind and the period — because a запит that could not name
 * the period would be asking about an unspecified thing. Everything else is fixed text, and no
 * number of its own ever enters here: every сума, share and count in the файл is in `## Підсумок`
 * or in `## Дані`.
 */
export function REQUEST(kind: string, period: string): readonly string[] {
  return [
    `Це пакет фінансових даних із застосунку cap1tal — ${kind} за період ${period}. ` +
      'Проаналізуй наведені дані і дай власнику практичний фінансовий огляд за цей період.',
    'Усе потрібне є в цьому ж файлі, нижче: інструкції, як саме це зробити, контекст із ' +
      'визначенням кожного терміна, читабельний підсумок і самі дані. Шукати щось поза файлом ' +
      'не треба.',
  ];
}

/**
 * The короткий запит: the one or two sentences offered to the phone beside the файл, and the exact
 * text «Скопіювати запит» puts on the clipboard.
 *
 * One constant, with no period, no kind and no figure in it. Three reasons: the spec forbids it
 * from stating anything not already in the файл; a message pasted into a chat that already holds
 * the attachment gains nothing from repeating the period; and a constant is the same string whether
 * it went out with the файл or is copied afterwards — which is exactly the property the second
 * copy action needs.
 *
 * Nothing depends on it reaching anyone. The файл is self-contained and opens with its own запит;
 * this is the hint for the case where the app the owner chose took the attachment and no text.
 */
export const SHORT_REQUEST =
  'Проаналізуй, будь ласка, прикріплений файл cap1tal — у самому файлі є повний контекст, ' +
  'визначення термінів та інструкції, що саме з цими даними зробити.';

export const INSTRUCTIONS: Readonly<Record<PromptProfile, readonly string[]>> = {
  'external-advanced': [
    'Ти читаєш готовий пакет чисел, які застосунок cap1tal уже обчислив із записів власника. ' +
      'Користуйся лише даними з цього файлу і нічим іншим.',
    'Не вигадуй жодного числа, жодної категорії, жодної транзакції і жодної валюти, якої немає ' +
      'в даних.',
    'Не перераховуй те, що вже пораховано: якщо число є в даних, бери його як є. Твоє власне ' +
      'обчислення виглядатиме так само, як число застосунку, і власник не відрізнить одне від одного.',
    'Ніколи не додавай, не конвертуй і не порівнюй суми різних валют — кожна валюта має власний звіт.',
    'Відокремлюй факти від припущень: пиши прямо, що взято з даних, а що є твоїм припущенням.',
    'Кожну пораду позначай як рекомендацію, а не подавай її як висновок із даних.',
    'Якщо місяць позначено як частковий (partial), він ще не завершився — не став його поруч із ' +
      'повними місяцями як рівний.',
    'Не роби прогнозів і не обіцяй майбутніх сум.',
    'Відповідай українською.',
    'Склади відповідь із семи частин: (1) коротко про ситуацію за період; (2) головні зміни і чому ' +
      'цей період відрізняється від попереднього; (3) категорії, що помітно зросли; (4) що виглядає ' +
      'необов’язковим; (5) наскільки стабільні відкладено та інвестовано; (6) великі або незвичні ' +
      'витрати; (7) три-п’ять конкретних речей, вартих уваги.',
    'Дивись саме на: зміни від місяця до місяця, найбільші категорії за період, зміни, що ' +
      'виділяються на тлі попередніх місяців, а також ліміти і цілі, якщо вони є в даних.',
    'Пояснюй числа, а не переказуй таблицю.',
  ],
};

/**
 * The two instructions the файл gains only when the owner switched a detail on for that one run.
 *
 * Read from the пакет's own `included` and never from the choices, so the файл can only describe
 * the пакет it actually holds — and a switch that is off leaves no instruction behind, which is
 * what stops the assistant reasoning about продавці that are not there.
 *
 * Determinism is unharmed: `included` is part of the пакет, so one пакет still renders to one файл,
 * byte for byte — the two goldens beside this file are the two shapes.
 *
 * Both say the same thing about detail, because the failure is the same: a detail row summed into
 * a figure of the assistant's own looks exactly like a figure the app computed, and the owner has
 * no way to tell them apart.
 */
export const DETAIL_INSTRUCTIONS = {
  descriptions:
    'Продавці — це описи витрат, які надіслав банк, згруповані застосунком. Читай їх як контекст ' +
    'поруч з агрегатами, щоб пояснити, з чого склалася категорія: не підсумовуй їх, не рахуй за ' +
    'ними і не роби з них власного числа.',
  transactions:
    'Окремі транзакції наведені як контекст до агрегатів, а не як таблиця для підрахунку: не ' +
    'підсумовуй їх, не рахуй за ними і не став своє число на місце вже порахованого — усі ' +
    'підсумки вже є в даних.',
} as const;

export const CONTEXT: readonly string[] = [
  'Місячна картина — це шість чисел одного календарного місяця, окремо для кожної валюти.',
  'Витрачено — витрати місяця (разом із некатегоризованими, від’ємними коригуваннями і комісіями), ' +
    'за вирахуванням повернень.',
  'Дохід — усе, що надійшло ззовні за місяць, разом із додатними коригуваннями і відсотками.',
  'Інвестовано — чисті перекази на інвестиційні рахунки; гроші, що повернулися звідти, зменшують ' +
    'його і можуть зробити від’ємним.',
  'Відкладено — чисті перекази на накопичувальні рахунки.',
  'Позичено — чисті перекази на рахунки-борги: ці гроші не витрачені, але й недоступні, доки їх ' +
    'не повернуть.',
  'Залишилось — це дохід − витрачено − інвестовано − відкладено − позичено.',
  'Тотожність, яка тримає місяць: дохід = витрачено + інвестовано + відкладено + позичено + залишилось.',
  'Переказ між власними рахунками — не витрата: гроші лишилися власника, змінилося лише те, де вони лежать.',
  'Інвестиція — не витрата: це переказ на інвестиційний рахунок, і він рахується як «інвестовано».',
  'Повернення — не дохід: це від’ємна витрата у своїй же категорії.',
  'Коригування — не звичайна витрата і не звичайний дохід: це непояснені гроші. Від’ємне рахується ' +
    'як витрачено, додатне — як дохід.',
  'Ліміт — місячна стеля витрат на одну категорію, у власній валюті ліміту. Категорія перевищила ' +
    'ліміт того місяця, коли витрачено по ній (за вирахуванням повернень) строго більше за ліміт: ' +
    'рівність — не перевищення. Витрати в іншій валюті ні враховуються в ліміт, ні конвертуються ' +
    'до нього.',
  'Ціль — «відкласти стільки-то до дати». Її прогрес — це розрахунковий баланс прив’язаного ' +
    'рахунку, у валюті того рахунку і без жодної конвертації. Ціль досягнута, коли прогрес не ' +
    'менший за ціль, і прострочена, коли дата минула, а ціль не досягнута.',
  'Кожне число подане окремо для кожної валюти, і жодне число не поєднує валюти.',
  'Єдиний виняток — «приблизно в гривні» (approximateUah): він позначений як приблизний і має дату ' +
    'курсу, за яким його порахували.',
  'Частковий місяць (partial: true) ще триває; у періоді вказано, скільки днів минуло з усіх днів ' +
    'того місяця.',
  'Усі відношення — частки, ставки та зміни — подані в базисних пунктах (1/100 відсотка): ' +
    '2500 означає 25,00 %.',
  'null означає, що числа немає: база була нульова або порівнювати не було з чим. Це не нуль.',
  'Кожна сума — точний десятковий текст із кодом валюти поруч, у головних одиницях: ' +
    '{"amount": "4125.34", "currency": "UAH"}.',
];
