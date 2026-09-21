import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
} from './transaction';

/** Stable, app-owned values persisted with categories. Never use glyph-library names here. */
export const PICKABLE_CATEGORY_ICON_KEYS = [
  'basket', 'cart', 'utensils', 'coffee', 'burger', 'bread', 'delivery',
  'car', 'fuel', 'bus', 'taxi', 'parking',
  'home', 'bulb', 'wrench', 'sofa', 'document',
  'shirt', 'shoe', 'bag', 'laptop', 'phone', 'wifi', 'cloud',
  'heart-pulse', 'pill', 'dumbbell', 'sparkles', 'scissors', 'graduation-cap', 'book',
  'suitcase', 'plane', 'bed', 'ticket', 'film', 'gamepad', 'music',
  'gift', 'family', 'baby', 'paw', 'hand-heart', 'bank', 'coins', 'percent', 'briefcase', 'tag',
] as const;

export const APP_ONLY_CATEGORY_ICON_KEYS = ['question', 'plus-minus'] as const;
export const CATEGORY_ICON_KEYS = [...PICKABLE_CATEGORY_ICON_KEYS, ...APP_ONLY_CATEGORY_ICON_KEYS] as const;
export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export const RESERVED_CATEGORY_ICONS: Readonly<Record<string, CategoryIconKey>> = {
  [UNCATEGORISED_CATEGORY_ID]: 'question',
  [FEES_CATEGORY_ID]: 'percent',
  [CORRECTION_CATEGORY_ID]: 'plus-minus',
};

export const STARTER_CATEGORY_ICONS: Readonly<Record<string, CategoryIconKey>> = {
  home: 'home', coffee: 'coffee', groceries: 'basket', entertainment: 'ticket',
  'family-care': 'family', transport: 'car', travel: 'suitcase', bills: 'document', gifts: 'gift',
  'eating-out': 'utensils', 'food-delivery': 'delivery', krayshop: 'bag', digital: 'cloud',
  electronics: 'laptop', 'simeyniy-byudzhet': 'coins', clothing: 'shirt', health: 'heart-pulse',
  book: 'book', pets: 'paw', 'other-expense': 'tag', charity: 'hand-heart', education: 'graduation-cap',
  habits: 'tag', bulka: 'bread', services: 'scissors',
};

export function isPickableCategoryIcon(value: string): value is (typeof PICKABLE_CATEGORY_ICON_KEYS)[number] {
  return (PICKABLE_CATEGORY_ICON_KEYS as readonly string[]).includes(value);
}

function hasWord(name: string, word: string): boolean {
  // Unicode letters are a word boundary; punctuation and spaces are separators.
  return new RegExp(`(^|[^\\p{L}])${word}`, 'iu').test(name);
}

/** First match wins. Keep the broad words after more specific ones (e.g. family before care). */
const KEYWORDS: readonly [string, CategoryIconKey][] = [
  ['каф', 'coffee'], ['coffee', 'coffee'], ['продукт', 'basket'], ['grocery', 'basket'],
  ['ресторан', 'utensils'], ['eating', 'utensils'], ['delivery', 'delivery'], ['достав', 'delivery'],
  ['фаст', 'burger'], ['burger', 'burger'], ['булк', 'bread'], ['bread', 'bread'],
  ['таксі', 'taxi'], ['taxi', 'taxi'], ['transport', 'car'], ['транспорт', 'car'], ['авто', 'car'],
  ['fuel', 'fuel'], ['пальн', 'fuel'], ['bus', 'bus'], ['паркув', 'parking'], ['parking', 'parking'],
  ['home', 'home'], ['дім', 'home'], ['комун', 'bulb'], ['ремонт', 'wrench'], ['repair', 'wrench'],
  ['мебл', 'sofa'], ['платеж', 'document'], ['bill', 'document'], ['одяг', 'shirt'], ['clothing', 'shirt'],
  ['взут', 'shoe'], ['shopping', 'bag'], ['покупк', 'bag'], ['electronic', 'laptop'], ['телефон', 'phone'],
  ['internet', 'wifi'], ['інтернет', 'wifi'], ['digital', 'cloud'], ['підпис', 'cloud'],
  ['лікар', 'heart-pulse'], ['health', 'heart-pulse'], ['здоров', 'heart-pulse'], ['pharmacy', 'pill'],
  ['аптек', 'pill'], ['ліки', 'pill'], ['workout', 'dumbbell'], ['спорт', 'dumbbell'], ['beauty', 'sparkles'],
  ['краса', 'sparkles'], ['service', 'scissors'], ['послуг', 'scissors'], ['education', 'graduation-cap'],
  ['освіт', 'graduation-cap'], ['book', 'book'], ['книг', 'book'], ['travel', 'suitcase'], ['подорож', 'suitcase'],
  ['avia', 'plane'], ['plane', 'plane'], ['готел', 'bed'], ['hotel', 'bed'], ['entertainment', 'ticket'],
  ['розваг', 'ticket'], ['кіно', 'film'], ['film', 'film'], ['ігри', 'gamepad'], ['game', 'gamepad'],
  ['music', 'music'], ['музик', 'music'], ['gift', 'gift'], ['подар', 'gift'], ['family', 'family'],
  ['сімейн', 'family'], ['діти', 'baby'], ['baby', 'baby'], ['pets', 'paw'], ['тварин', 'paw'],
  ['charity', 'hand-heart'], ['благод', 'hand-heart'], ['finance', 'bank'], ['фінанс', 'bank'],
  ['бюджет', 'coins'], ['money', 'coins'], ['грош', 'coins'], ['percent', 'percent'], ['відсот', 'percent'],
  ['work', 'briefcase'], ['робот', 'briefcase'],
];

export function suggestCategoryIcon(name: string): CategoryIconKey {
  return KEYWORDS.find(([word]) => hasWord(name, word))?.[1] ?? 'tag';
}

export function startingCategoryIcon(input: { id: string; name: string }): CategoryIconKey {
  return RESERVED_CATEGORY_ICONS[input.id] ?? STARTER_CATEGORY_ICONS[input.id] ?? suggestCategoryIcon(input.name);
}

/** Resolves unsafe/newer persisted values without ever leaving a tile blank. */
export function resolveCategoryIcon(input: { id: string; name: string; iconKey?: string }): CategoryIconKey {
  const reserved = RESERVED_CATEGORY_ICONS[input.id];
  if (reserved) return reserved;
  if (input.iconKey && isPickableCategoryIcon(input.iconKey)) return input.iconKey;
  return input.iconKey === undefined || input.iconKey === null ? startingCategoryIcon(input) : 'tag';
}
