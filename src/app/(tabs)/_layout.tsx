import AppTabs from '@/components/app-tabs';

/**
 * The three tabs — Головний, Місяць and Рахунки, in the order the vision names the screens. They
 * are a group `(tabs)` so the root layout can be a Stack: editing a transaction, and a category's
 * month list, are pushed on top of the tabs rather than becoming tabs of their own.
 */
export default function TabsLayout() {
  return <AppTabs />;
}
