const { execSync } = require('node:child_process');

/**
 * The only thing this file adds to `app.json`: which build this is.
 *
 * A репорт про помилку filed on the phone is read at the laptop, and the first question there is
 * always «which tree was that?». A release stack is minified and a version of `0.0.0` names
 * nothing, so the short commit and whether the working tree was dirty when the bundle was made is
 * what makes a stack readable again — with that commit checked out, the Hermes source map in that
 * build's output lines up.
 *
 * Everything else stays in `app.json`, which remains the readable source of the app's config:
 * Expo hands this function that file's contents and takes back what it returns.
 *
 * Read from git here, rather than from a generated `src/build-info.ts`, because such a file is
 * either gitignored (and then `tsc` fails in CI) or committed (and then stale on every commit).
 * Without git, the build is honestly `unknown` rather than wrong.
 *
 * **`extra` does not travel over Metro.** expo-constants embeds the resolved config into the APK
 * as `assets/app.config` at build time, and `Constants.expoConfig` reads that embedded file — so a
 * change here reaches the device only through a rebuild, exactly like an `app.json` edit. A smoke
 * run found this the expensive way: a репорт filed against a reused APK said «Коміт: unknown»
 * while `npx expo config --type public` resolved the real commit. `scripts/android.sh` therefore
 * watches this file in its rebuild trigger.
 *
 * The consequence to keep in mind when reading a репорт from a *development* build: the commit
 * below is the commit the APK was built at, while the JS came from Metro and may be newer. On a
 * release build there is only one answer and it is this one. `dirty` is the flag that says not to
 * trust the commit alone.
 */
function git(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function buildInfo() {
  const commit = git('git rev-parse --short HEAD');
  if (commit === null) {
    return { commit: 'unknown', dirty: false, builtAt: new Date().toISOString() };
  }
  const status = git('git status --porcelain');
  return {
    commit,
    // `null` means git answered the commit but not the status; treating that as clean would be a
    // claim, so it is a dirty tree — the safer of the two lies to tell about a build.
    dirty: status === null ? true : status.length > 0,
    builtAt: new Date().toISOString(),
  };
}

module.exports = ({ config }) => ({
  ...config,
  extra: { ...config.extra, build: buildInfo() },
});
