import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * The Android dialog accent (`plugins/with-android-accent.js`) is a copy of the theme's accent,
 * because a config plugin is plain Node and cannot import `src/constants/theme.ts`. This is what
 * keeps the copy honest: a new accent in the theme fails here until the plugin follows.
 *
 * It lives in `src/ui/` because `vitest` only collects `src/**`; nothing here renders anything.
 * The theme is read as text, not imported: it pulls in `global.css`, which Node cannot load.
 */

const theme = readFileSync(new URL('../constants/theme.ts', import.meta.url), 'utf8');

/** `accent: '#…'` inside the `light: {` or `dark: {` block of `Colors`. */
function themeAccent(mode: 'light' | 'dark'): string | undefined {
  const block = theme.slice(theme.indexOf(`  ${mode}: {`));
  return /\n\s+accent: '(#[0-9A-Fa-f]{6})'/.exec(block)?.[1];
}

interface Xml {
  resources: Record<string, unknown>;
}
interface Plugin {
  ACCENT: { light: string; dark: string };
  assignAccentColor(xml: Xml, value: string): Xml;
  assignAccentStyle(xml: Xml): Xml;
}

const plugin = createRequire(import.meta.url)('../../plugins/with-android-accent.js') as Plugin;
const appJson = createRequire(import.meta.url)('../../app.json') as {
  expo: { plugins: readonly unknown[] };
};

describe('Android dialog buttons wear the app accent, not Material teal', () => {
  it('carries the theme accent for both modes', () => {
    expect(themeAccent('light')).toMatch(/^#/);
    expect(plugin.ACCENT).toEqual({ light: themeAccent('light'), dark: themeAccent('dark') });
  });

  it('sets colorAccent on AppTheme and the colour resource it points at', () => {
    const styles = plugin.assignAccentStyle({
      resources: {
        style: [
          {
            $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
            item: [{ _: '@color/colorPrimary', $: { name: 'colorPrimary' } }],
          },
        ],
      },
    });
    expect(JSON.stringify(styles)).toContain(
      '{"$":{"name":"colorAccent"},"_":"@color/colorAccent"}',
    );

    const colors = plugin.assignAccentColor({ resources: {} }, plugin.ACCENT.dark);
    expect(colors.resources.color).toEqual([{ $: { name: 'colorAccent' }, _: '#D9A441' }]);
  });

  it('is wired into app.json, so prebuild runs it', () => {
    expect(appJson.expo.plugins).toContain('./plugins/with-android-accent');
  });
});
