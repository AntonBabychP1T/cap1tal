import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * «Перші кроки» is specified to change nothing, and the screen itself is JSX that `verify` never
 * runs. So the property is held structurally instead: the screen may not so much as *hold* a port
 * that writes. Reading the source is weaker than executing it, but it catches the change that
 * would actually break this — someone wiring a repository or the monobank connection in for
 * convenience — and it catches it in `verify` rather than on a device.
 *
 * It lives here and not next to the screen for one hard reason: expo-router bundles *every* file
 * under `src/app/` through `require.context`, so a test file there is shipped into the app, and
 * its `node:fs` import brings the whole bundle down with an unresolvable module — green `verify`,
 * dead app. Tests never live under `src/app/`.
 */

const source = readFileSync(new URL('../app/onboarding.tsx', import.meta.url), 'utf8');

/** Every `import … from '<module>'` in the screen, as [what was imported, where from]. */
const imports = [...source.matchAll(/import\s+([\s\S]*?)\s+from\s+'([^']+)'/g)].map(
  ([, what, from]) => ({ what: what ?? '', from: from ?? '' }),
);

describe('the setup view writes nothing', () => {
  it('Scenario: Opening and leaving changes nothing', () => {
    // Asserted on what is *imported*, not on what the call sites happen to be named: a repository
    // brought in under any alias at all still has to appear here.
    const fromRepos = imports.filter((i) => i.from === '@/db/repos').map((i) => i.what);
    expect(fromRepos).toEqual(['{ accounts as accountsRepo, imports as importsRepo }']);

    // And those two, the token store and the platform question are the whole of what it calls —
    // every one a read. `openSettings` opens Android's own screen, on a tap, changing nothing here.
    const called = new Set(
      [...source.matchAll(/\b(\w+)\.(\w+)\(/g)]
        .map(([, port, method]) => `${port}.${method}`)
        .filter((call) => /^(accountsRepo|importsRepo|monobankTokenStore|notificationAccess)\./.test(call)),
    );
    expect([...called].sort()).toEqual([
      'accountsRepo.list',
      'importsRepo.committedAt',
      'monobankTokenStore.read',
      'notificationAccess.openSettings',
      'notificationAccess.state',
    ]);
  });

  it('Wires no port that could write, so it could not start writing by accident', () => {
    // The connection carries `cacheAccounts` and a `fetch`; the setup view needs neither, and
    // holding them is how a read-only screen quietly stops being one. Nothing that writes may be
    // imported from anywhere — a `src/db/**` module other than the two repos included.
    const suspicious = imports.filter(
      (i) =>
        /^@\/(db|monobank)\//.test(i.from) &&
        i.from !== '@/db/repos',
    );
    expect(suspicious).toEqual([]);
    expect(source).not.toContain('monobankConnection');
    expect(source).not.toContain('seedStarterSet');
  });
});
