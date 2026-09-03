import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * bug-report «A репорт про помилку is what the owner wrote plus what the app attaches» — the
 * clause about «whether the working tree was clean».
 *
 * Neither file this reads is executed by `verify`: `.gitignore` is git's and `app.config.js` runs
 * only when Expo resolves the config. So they are read as text, the way the screens are read in
 * `src/ui/receipt-screen.test.ts` — structural evidence, which is all the gate can give here, and
 * enough to stop the exact regression that made every lane build lie about its own tree.
 */
describe('a build says «брудне» only about itself', () => {
  it('`node_modules` is ignored whether it is a directory or a symlink', () => {
    const ignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');

    // With the trailing slash the pattern matches a directory and not a symlink, and every
    // `auto-work` lane's node_modules **is** a symlink into the main tree — so a spotless lane
    // showed `?? node_modules` and the build made in it reported a dirty tree.
    expect(ignore).toMatch(/^node_modules$/m);
    expect(ignore).not.toMatch(/^node_modules\/$/m);
  });

  it('the build asks git about the sources it is built from, not about the whole tree', () => {
    const config = readFileSync(new URL('../../app.config.js', import.meta.url), 'utf8');

    // A bare `git status --porcelain` calls the tree dirty for any untracked file anywhere — a
    // screenshot, a scratch file — none of which is in the bundle whose provenance is being stated.
    expect(config).not.toMatch(/git\(\s*'git status --porcelain'\s*\)/);
    expect(config).toContain('git status --porcelain -- ');
    // And the list it is scoped to actually names the sources a bundle is made of — the code and
    // the assets, and the two configs every bundle is built *through*. A path missing from it is
    // the worse half of this defect: a build calling itself clean about a tree it was not made
    // from, which no reader of the репорт can catch.
    for (const path of [
      'src',
      'assets',
      'modules',
      'app.json',
      'app.config.js',
      'babel.config.js',
      'metro.config.js',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
    ]) {
      expect(config).toContain(`'${path}'`);
    }
  });
});
