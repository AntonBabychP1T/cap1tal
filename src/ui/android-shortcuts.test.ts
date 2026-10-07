import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * The launcher shortcut «Записати витрату» (`plugins/with-android-shortcuts.js`) and the stack a
 * form opened by it stands on. The plugin's output is proven at config level through its pure
 * exports, the same way `android-accent.test.ts` proves the accent plugin; whether Gradle accepts
 * the generated resources is CI's `android` job, never `verify`. The screens are read as text,
 * because `verify` renders nothing.
 */

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const theme = source('../constants/theme.ts');

interface Manifest {
  manifest: {
    'uses-permission'?: unknown[];
    application: {
      $: Record<string, string>;
      activity: {
        $: Record<string, string>;
        'intent-filter'?: unknown[];
        'meta-data'?: { $: Record<string, string> }[];
      }[];
    }[];
  };
}
interface Strings {
  resources: { string?: { $: { name: string }; _: string }[] };
}
interface Plugin {
  ACCENT: string;
  LABELS: { long: { name: string; value: string }; short: { name: string; value: string } };
  shortcutsXml(opts: { pkg: string; scheme: string }): string;
  iconXml(): string;
  withShortcutsMetaData(manifest: Manifest): Manifest;
  assignShortcutStrings(strings: Strings): Strings;
}

const plugin = createRequire(import.meta.url)('../../plugins/with-android-shortcuts.js') as Plugin;
const appJson = createRequire(import.meta.url)('../../app.json') as {
  expo: { scheme: string; android: { package: string }; plugins: readonly unknown[] };
};

/** What Expo's prebuild hands the plugin: the launcher activity, with the scheme's filter. */
function generatedManifest(): Manifest {
  return {
    manifest: {
      'uses-permission': [{ $: { 'android:name': 'android.permission.INTERNET' } }],
      application: [
        {
          $: { 'android:name': '.MainApplication' },
          activity: [
            {
              $: { 'android:name': '.MainActivity' },
              'intent-filter': [
                {
                  action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                  category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe('app-shell: a long press on the app icon offers «Записати витрату»', () => {
  it('Scenario: The shortcut is offered on the icon', () => {
    const xml = plugin.shortcutsXml({
      pkg: appJson.expo.android.package,
      scheme: appJson.expo.scheme,
    });

    expect(xml).toContain('android:shortcutId="record_expense"');
    expect(xml).toContain('android:action="android.intent.action.VIEW"');
    expect(xml).toContain('android:data="cap1tal://transaction/new"');
    expect(xml).toContain('android:targetPackage="com.antonbabychp1t.cap1tal"');
    expect(xml).toContain('android:targetClass="com.antonbabychp1t.cap1tal.MainActivity"');
    expect(xml).toContain(`android:shortcutLongLabel="@string/${plugin.LABELS.long.name}"`);
    expect(xml).toContain(`android:shortcutShortLabel="@string/${plugin.LABELS.short.name}"`);

    const strings = plugin.assignShortcutStrings({ resources: {} });
    const named = new Map(strings.resources.string?.map((s) => [s.$.name, s._]));
    expect(named.get(plugin.LABELS.long.name)).toBe('Записати витрату');
    expect(named.get(plugin.LABELS.short.name)).toBe('Витрата');
    // Android asks for a short label of at most ten characters.
    expect(plugin.LABELS.short.value.length).toBeLessThanOrEqual(10);
  });

  it('declares the shortcuts on the main activity exactly once, even applied twice', () => {
    const once = plugin.withShortcutsMetaData(generatedManifest());
    const twice = plugin.withShortcutsMetaData(once);
    const meta = twice.manifest.application[0]?.activity[0]?.['meta-data'] ?? [];

    expect(meta).toEqual([
      { $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' } },
    ]);
  });

  it('needs no permission', () => {
    const before = generatedManifest().manifest['uses-permission'];
    const after = plugin.withShortcutsMetaData(generatedManifest()).manifest['uses-permission'];
    expect(after).toEqual(before);
    expect(source('../../plugins/with-android-shortcuts.js')).not.toContain('uses-permission');
  });

  it('wears the theme accent on its icon', () => {
    const block = theme.slice(theme.indexOf('  light: {'));
    const accent = /\n\s+accent: '(#[0-9A-Fa-f]{6})'/.exec(block)?.[1];
    expect(accent).toMatch(/^#/);
    expect(plugin.ACCENT).toBe(accent);
    expect(plugin.iconXml()).toContain(`android:fillColor="${accent}"`);
  });

  it('is applied by prebuild', () => {
    expect(appJson.expo.plugins).toContain('./plugins/with-android-shortcuts');
  });
});

describe('app-shell: the stack under a form the shortcut opened', () => {
  const layout = source('../app/_layout.tsx');
  const entryScreen = source('../app/transaction/new.tsx');
  const main = source('../app/(tabs)/index.tsx');

  it('Scenario: Recording from the shortcut lands on Головний', () => {
    // A cold start on the link builds Головний beneath the form, so `router.back()` lands there.
    expect(layout).toContain("export const unstable_settings = { initialRouteName: '(tabs)' };");
    expect(entryScreen).toContain("if (then === 'leave') {\n        router.back();");
  });

  it('Scenario: Leaving without recording lands on Головний', () => {
    expect(entryScreen).toContain('<ScreenHeader title="Нова транзакція" back={() => router.back()} />');
  });

  it('Scenario: An open form is not opened twice', () => {
    const route = layout.slice(layout.indexOf('name="transaction/new"'));
    const props = route.slice(0, route.indexOf('/>'));
    expect(props).toContain('dangerouslySingular={(_, params) => entrySingularId(params)}');
    // Every open form answers like one opened from nothing, once it has read its route.
    expect(entryScreen).toContain(
      'router.setParams({ type: undefined, to: undefined, account: undefined });',
    );
  });

  it('Scenario: An open переказ is not turned into a витрата', () => {
    // The shortcut names no тип, and the form reads its route only when it is built.
    const xml = plugin.shortcutsXml({ pkg: 'p', scheme: 's' });
    expect(xml).toContain('android:data="s://transaction/new"');
    expect(xml).not.toContain('transaction/new?');
    expect(entryScreen).toContain('useState<EntryType>(() => entryFromRoute(asked.type))');
  });

  it('Scenario: The shortcut on a device with no рахунок', () => {
    // «Перші кроки» replaces only a Головний in sight — never the form standing over it.
    expect(main).toContain('const focused = useIsFocused();');
    expect(main).toMatch(/if \(landedOnSetup \|\| !setupNeeded \|\| !focused\) \{\s*return;\s*\}/);
    expect(main).toContain("router.replace('/onboarding');");
  });

  it('Scenario: The shortcut on a device with no рахунок — the first рахунок ends it', () => {
    // Emulator, quick-entry smoke: after `reset`, the shortcut's form, «До Рахунків» and a first
    // рахунок, coming back to Головний still sent the owner to «Перші кроки». The redirect ran on
    // the read Головний made under the form, before its focus read landed. It asks storage again.
    const effect = main.slice(main.indexOf('if (landedOnSetup || !setupNeeded || !focused)'));
    const body = effect.slice(0, effect.indexOf("router.replace('/onboarding');"));
    expect(body).toContain('const now = storedHistory.read();');
    expect(body).toMatch(
      /if \(\s*!firstRun\(\{ accounts: now\.accounts\.length, transactions: now\.transactions\.length \}\)\s*\) \{\s*return;\s*\}/,
    );
  });
});
