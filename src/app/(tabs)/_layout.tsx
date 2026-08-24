import AppTabs from '@/components/app-tabs';

/**
 * The two tabs — Головний and Рахунки. They are a group `(tabs)` so the root layout can be a
 * Stack: editing a transaction is pushed on top of the tabs, not made a third tab.
 */
export default function TabsLayout() {
  return <AppTabs />;
}
