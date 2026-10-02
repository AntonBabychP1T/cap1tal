/**
 * The шаблон категоризації: the built-in knowledge that «АТБ» is продукти and «Аврора» is дім,
 * shipped with the app as data so a device with no правило at all still recognises the obvious
 * merchants (categorisation-rules, "The app ships a шаблон of базові категорії").
 *
 * What is personal is only which категорія of *this* device each базова категорія lands in — so
 * each one names a типова категорія among the starter rows by its stable slug, and the owner's
 * choice, stored in `src/db/`, overrides it. Nothing here is ever stored: updating the app updates
 * the шаблон (design T1, T3).
 *
 * Every merchant pattern is written already folded and is matched exactly as a правило's is — a
 * substring of the опис, case folded, no transliteration — so a merchant seen in both scripts is
 * listed under both spellings. Three collisions are settled by the ladder, not by order: «bolt» is
 * Транспорт and «bolt food» is Доставка їжі, and Latin «metro» is Продукти while «kyiv metro» and
 * «metropoliten» are Транспорт, and «vetclinic» is Тварини while «clinic» is Здоровʼя — the
 * longer pattern wins. Words that are also common street names
 * («театр», «хлібн», «музей», «спорт» inside «транспорт») are left out on purpose: a bank's опис
 * often carries the street, and the owner's own правило is what corrects a merchant the шаблон
 * misses.
 *
 * No colocated test reads this back as itself: `rule-template.test.ts` restates the spec's table
 * independently and checks the data's shape (the `starter-set.ts` precedent).
 */
export interface TemplateGroup {
  /** Stable slug — a stored choice addresses the базова категорія by it. */
  readonly id: string;
  /** The базова категорія's Ukrainian name — what «Базові категорії» lists. */
  readonly name: string;
  /** The типова категорія: a starter-set slug, so it survives the owner renaming that row. */
  readonly defaultCategoryId: string;
  /** Folded merchant patterns, matched as substrings of the опис. */
  readonly merchants: readonly string[];
  /** ISO-18245 merchant category codes, matched by equality. */
  readonly mcc: readonly number[];
}

/**
 * Raised by hand whenever `TEMPLATE_GROUPS` changes what it covers. The first open under a version
 * storage has not swept sweeps «Без категорії» once (design T5); `rule-template.test.ts` ties the
 * number to a fingerprint of the groups so the data cannot change without it.
 */
export const TEMPLATE_VERSION = 1;

/**
 * The категорія id a базова категорія lands in, before checking that this device holds it: the
 * owner's stored choice when there is one — `null` meaning switched off — and its типова категорія
 * otherwise (`undefined`: untouched). The one statement of that rule, read by the matcher and the
 * menu alike so the two can never disagree about where a group lands.
 */
export function templateTargetOf(
  group: TemplateGroup,
  stored: string | null | undefined,
): string | undefined {
  if (stored === undefined) return group.defaultCategoryId;
  return stored ?? undefined;
}

export const TEMPLATE_GROUPS: readonly TemplateGroup[] = [
  {
    id: 'groceries',
    name: 'Продукти',
    defaultCategoryId: 'groceries',
    merchants: [
      'атб', 'atb', 'сільпо', 'silpo', 'новус', 'novus', 'фора', 'fozzy', 'варус', 'varus',
      'ашан', 'auchan', 'metro', 'велмарт', 'velmart', 'білла', 'billa', 'еко маркет',
      'eko market', 'рукавичка', 'rukavychka', 'наш край', 'nash kray', 'маркетопт', 'marketopt',
    ],
    mcc: [5300, 5411, 5422, 5441, 5451, 5499],
  },
  {
    id: 'bakery',
    name: 'Пекарня',
    defaultCategoryId: 'bulka',
    merchants: ['пекарн', 'bakery', 'круасан', 'croissant', 'булочна'],
    mcc: [5462],
  },
  {
    id: 'eating-out',
    name: 'Кафе і ресторани',
    defaultCategoryId: 'eating-out',
    merchants: [
      'ресторан', 'restaurant', 'кафе', 'cafe', 'бістро', 'bistro', 'mcdonald', 'макдональд',
      'kfc', 'пузата хата', 'puzata hata', 'burger', 'бургер', 'pizza', 'піца', 'sushi', 'суші',
      'shawarma', 'шаурма', 'salateira', 'салатейра',
    ],
    mcc: [5812, 5813, 5814],
  },
  {
    id: 'coffee',
    name: 'Кава',
    defaultCategoryId: 'coffee',
    merchants: [
      'coffee', 'kava', 'арома кава', 'кавʼярня', "кав'ярня", 'кав’ярня', 'кофейня', 'espresso',
      'еспресо', 'starbucks', 'один в каное', 'odyn v kanoe',
    ],
    mcc: [],
  },
  {
    id: 'food-delivery',
    name: 'Доставка їжі',
    defaultCategoryId: 'food-delivery',
    merchants: ['glovo', 'глово', 'bolt food', 'uber eats', 'ubereats', 'raketa', 'ракета'],
    mcc: [],
  },
  {
    id: 'transport',
    name: 'Транспорт',
    defaultCategoryId: 'transport',
    merchants: [
      'uklon', 'уклон', 'bolt', 'болт', 'uber', 'taxi', 'таксі', 'метрополітен', 'metropoliten',
      'kyiv metro', 'київпастранс', 'kyivpastrans', 'okko', 'окко', 'wog', 'socar', 'сокар',
      'upg', 'shell', 'avias', 'авіас', 'brsm', 'брсм', 'parking', 'паркінг', 'парковка',
    ],
    mcc: [4111, 4121, 4131, 4784, 5541, 5542, 7523],
  },
  {
    id: 'travel',
    name: 'Подорожі',
    defaultCategoryId: 'travel',
    merchants: [
      'booking', 'airbnb', 'agoda', 'trip.com', 'hotel', 'готель', 'hostel', 'хостел', 'ryanair',
      'wizz', 'skyup', 'turkish airlines', 'укрзалізниця', 'ukrzaliznytsia', 'uz.gov.ua',
      'flixbus', 'busfor', 'proizd',
    ],
    mcc: [4112, 4411, 4511, 4722, 7011, 7012],
  },
  {
    id: 'home',
    name: 'Дім',
    defaultCategoryId: 'home',
    merchants: [
      'аврора', 'avrora', 'епіцентр', 'epicentr', 'jysk', 'ikea', 'нова лінія', 'nova liniya',
      'leroy', 'леруа',
    ],
    mcc: [5200, 5211, 5231, 5251, 5261, 5712, 5714, 5719],
  },
  {
    id: 'clothing',
    name: 'Одяг і взуття',
    defaultCategoryId: 'clothing',
    merchants: [
      'zara', 'h&m', 'reserved', 'waikiki', 'colin', 'intertop', 'інтертоп', 'answear', 'modivo',
      'bershka', 'pull&bear', 'stradivarius', 'massimo dutti', 'sinsay', 'cropp', 'mango',
      'uniqlo', 'new yorker', 'new balance', 'deichmann', 'nike', 'adidas', 'puma',
    ],
    mcc: [5611, 5621, 5631, 5641, 5651, 5655, 5661, 5691, 5699],
  },
  {
    id: 'health',
    name: 'Здоровʼя',
    defaultCategoryId: 'health',
    merchants: [
      'аптека', 'apteka', 'pharmacy', 'подорожник', 'podorozhnyk', 'синево', 'synevo', 'діла',
      'dila', 'медіком', 'medikom', 'добробут', 'dobrobut', 'клініка', 'clinic', 'medical',
      'стоматолог', 'dental', 'оптика', 'optika',
    ],
    mcc: [5912, 5975, 5976, 8011, 8021, 8031, 8041, 8042, 8043, 8049, 8050, 8062, 8071, 8099],
  },
  {
    id: 'electronics',
    name: 'Електроніка',
    defaultCategoryId: 'electronics',
    merchants: [
      'rozetka', 'розетка', 'comfy', 'комфі', 'фокстрот', 'foxtrot', 'eldorado', 'ельдорадо',
      'алло', 'allo.ua', 'moyo', 'мойо', 'citrus', 'цитрус', 'ябко', 'yabko', 'samsung', 'xiaomi',
    ],
    mcc: [5045, 5722, 5732],
  },
  {
    id: 'digital',
    name: 'Цифрове',
    defaultCategoryId: 'digital',
    merchants: [
      'google', 'apple.com', 'itunes', 'icloud', 'netflix', 'spotify', 'youtube', 'megogo',
      'sweet.tv', 'steam', 'playstation', 'xbox', 'nintendo', 'openai', 'chatgpt', 'anthropic',
      'claude.ai', 'github', 'jetbrains', 'microsoft', 'adobe', 'dropbox', 'notion', 'figma',
      'canva', 'patreon', '1password', 'telegram', 'discord',
    ],
    mcc: [4816, 5734, 5815, 5816, 5817, 5818, 7372],
  },
  {
    id: 'bills',
    name: 'Комунальні й звʼязок',
    defaultCategoryId: 'bills',
    merchants: [
      'київстар', 'kyivstar', 'vodafone', 'водафон', 'lifecell', 'лайфселл', 'укртелеком',
      'ukrtelecom', 'volia', 'датагруп', 'datagroup', 'тріолан', 'triolan', 'енерго', 'energo',
      'yasno', 'нафтогаз', 'naftogaz', 'водоканал', 'vodokanal', 'комунальн', 'квартплат',
      'осбб', 'osbb',
    ],
    mcc: [4814, 4899, 4900],
  },
  {
    id: 'entertainment',
    name: 'Розваги',
    defaultCategoryId: 'entertainment',
    merchants: [
      'multiplex', 'мультиплекс', 'планета кіно', 'planeta kino', 'кінотеатр', 'cinema',
      'karabas', 'карабас', 'concert.ua', 'theatre', 'theater', 'боулінг', 'bowling', 'квест',
      'аквапарк', 'aquapark', 'зоопарк',
    ],
    mcc: [7832, 7922, 7929, 7991, 7993, 7996, 7998, 7999],
  },
  {
    id: 'sport',
    name: 'Спорт',
    defaultCategoryId: 'entertainment',
    merchants: [
      'sportlife', 'спортлайф', 'fitness', 'фітнес', 'gym', 'decathlon', 'декатлон',
      'intersport', 'басейн', 'yoga', 'йога', 'crossfit', 'tennis', 'теніс',
    ],
    mcc: [5941, 7941, 7997],
  },
  {
    id: 'pets',
    name: 'Тварини',
    defaultCategoryId: 'pets',
    merchants: [
      'masterzoo', 'мастерзоо', 'зоомагазин', 'зоотовари', 'ветеринар', 'veterinar', 'ветклінік',
      'vetclinic', 'royal canin', 'pet shop', 'petshop',
    ],
    mcc: [742, 5995],
  },
  {
    id: 'books',
    name: 'Книги',
    defaultCategoryId: 'book',
    merchants: [
      'yakaboo', 'якабу', 'книгарня', 'knyharnya', 'книжков', 'vivat', 'віват', 'наш формат',
      'nash format', 'readeat',
    ],
    mcc: [5192, 5942],
  },
  {
    id: 'education',
    name: 'Освіта',
    defaultCategoryId: 'education',
    merchants: [
      'coursera', 'udemy', 'prometheus', 'прометеус', 'duolingo', 'projector', 'проджектор',
      'school', 'школа',
    ],
    mcc: [8211, 8220, 8241, 8244, 8249, 8299],
  },
  {
    id: 'beauty',
    name: 'Краса й догляд',
    defaultCategoryId: 'services',
    merchants: [
      'watsons', 'вотсонс', 'notino', 'brocard', 'брокард', 'makeup', 'beauty', 'салон краси',
      'barber', 'барбершоп', 'перукар', 'манікюр', 'manicure',
    ],
    mcc: [5977, 7230, 7298],
  },
  {
    id: 'gifts',
    name: 'Подарунки й квіти',
    defaultCategoryId: 'gifts',
    merchants: ['квіти', 'kvity', 'flower', 'букет', 'gift', 'подарунк'],
    mcc: [5947, 5992],
  },
  {
    id: 'charity',
    name: 'Благодійність',
    defaultCategoryId: 'charity',
    merchants: [
      'повернись живим', 'come back alive', 'savelife', 'united24', 'притула', 'prytula',
      'благодійн', 'charity', 'donate',
    ],
    mcc: [8398],
  },
  {
    id: 'habits',
    name: 'Алкоголь і тютюн',
    defaultCategoryId: 'habits',
    merchants: ['wine', 'алкомаркет', 'тютюн', 'tobacco', 'сигарет', 'iqos', 'vape', 'вейп'],
    mcc: [5921, 5993],
  },
];
