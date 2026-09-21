import { type CategoryIconKey, PICKABLE_CATEGORY_ICON_KEYS } from '../domain/category-icon';
import type { IconName } from './icons';

export interface CategoryIconDefinition {
  readonly glyph: IconName;
  readonly name: string;
  readonly group: string;
}

const entry = (glyph: IconName, name: string, group: string): CategoryIconDefinition => ({ glyph, name, group });

/** Display-only catalogue. Domain owns persistence keys; this owns their picture and Ukrainian copy. */
export const CATEGORY_ICONS: Readonly<Record<CategoryIconKey, CategoryIconDefinition>> = {
  basket: entry('basket', 'Продукти', 'Їжа'), cart: entry('cart', 'Супермаркет', 'Їжа'), utensils: entry('utensils', 'Ресторан', 'Їжа'), coffee: entry('coffee', 'Кава', 'Їжа'), burger: entry('burger', 'Фастфуд', 'Їжа'), bread: entry('bread', 'Випічка', 'Їжа'), delivery: entry('delivery', 'Доставка', 'Їжа'),
  car: entry('car', 'Авто', 'Транспорт'), fuel: entry('fuel', 'Пальне', 'Транспорт'), bus: entry('bus', 'Громадський транспорт', 'Транспорт'), taxi: entry('taxi', 'Таксі', 'Транспорт'), parking: entry('parking', 'Паркування', 'Транспорт'),
  home: entry('home', 'Дім', 'Дім'), bulb: entry('bulb', 'Комунальні', 'Дім'), wrench: entry('wrench', 'Ремонт', 'Дім'), sofa: entry('sofa', 'Меблі', 'Дім'), document: entry('document', 'Платежі', 'Дім'),
  shirt: entry('shirt', 'Одяг', 'Покупки'), shoe: entry('shoe', 'Взуття', 'Покупки'), bag: entry('bag', 'Покупки', 'Покупки'),
  laptop: entry('laptop', 'Електроніка', "Техніка і зв'язок"), phone: entry('phone', 'Телефон', "Техніка і зв'язок"), wifi: entry('wifi', 'Інтернет', "Техніка і зв'язок"), cloud: entry('cloud', 'Підписки', "Техніка і зв'язок"),
  'heart-pulse': entry('heartPulse', 'Здоров’я', "Здоров'я і краса"), pill: entry('pill', 'Аптека', "Здоров'я і краса"), dumbbell: entry('dumbbell', 'Спорт', "Здоров'я і краса"), sparkles: entry('sparkles', 'Краса', "Здоров'я і краса"), scissors: entry('scissors', 'Послуги', "Здоров'я і краса"),
  'graduation-cap': entry('graduationCap', 'Освіта', 'Навчання'), book: entry('book', 'Книги', 'Навчання'), suitcase: entry('suitcase', 'Подорожі', 'Подорожі'), plane: entry('plane', 'Авіа', 'Подорожі'), bed: entry('bed', 'Готель', 'Подорожі'),
  ticket: entry('ticket', 'Розваги', 'Дозвілля'), film: entry('film', 'Кіно', 'Дозвілля'), gamepad: entry('gamepad', 'Ігри', 'Дозвілля'), music: entry('music', 'Музика', 'Дозвілля'),
  gift: entry('gift', 'Подарунки', 'Люди і тварини'), family: entry('family', 'Сім’я', 'Люди і тварини'), baby: entry('baby', 'Діти', 'Люди і тварини'), paw: entry('paw', 'Тварини', 'Люди і тварини'), 'hand-heart': entry('handHeart', 'Благодійність', 'Люди і тварини'),
  bank: entry('bank', 'Фінанси', 'Гроші'), coins: entry('coins', 'Гроші', 'Гроші'), percent: entry('percent', 'Відсоток', 'Гроші'), briefcase: entry('briefcase', 'Робота', 'Гроші'), tag: entry('tag', 'Інше', 'Інше'),
  question: entry('question', 'Питання', 'Службові'), 'plus-minus': entry('plusMinus', 'Плюс-мінус', 'Службові'),
};

export const PICKABLE_CATEGORY_ICONS = PICKABLE_CATEGORY_ICON_KEYS.map((key) => ({ key, ...CATEGORY_ICONS[key] }));
export function categoryIconDefinition(key: CategoryIconKey): CategoryIconDefinition { return CATEGORY_ICONS[key]; }
