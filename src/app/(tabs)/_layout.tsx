import AppTabs from '@/components/app-tabs';

/**
 * The four tabs — Головний, Місяць, Рахунки and Налаштування, in the order the tech task names
 * the screens. They are a group `(tabs)` so the root layout can be a Stack: editing a
 * transaction, a category's month list and the Налаштування management lists are pushed on top
 * of the tabs rather than becoming tabs of their own.
 */
export default function TabsLayout() {
  return <AppTabs />;
}
