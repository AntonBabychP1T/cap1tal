import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { inMemoryBackupFiles } from './backup-file';

/**
 * The double the whole «Бекап» screen is proven against, and the one guarantee this directory
 * exists for: nothing `verify` runs loads a native module.
 */

describe('the backup file double', () => {
  it('hands a file over and remembers exactly what left', async () => {
    const files = inMemoryBackupFiles();

    expect(await files.save('cap1tal-2026-08-30.json', '{"app":"cap1tal"}')).toEqual({ kind: 'ok' });
    expect(files.saved()).toEqual([
      { name: 'cap1tal-2026-08-30.json', text: '{"app":"cap1tal"}' },
    ]);
  });

  it('answers each way a save can fail, and claims nothing when it does', async () => {
    for (const outcome of [
      { kind: 'cancelled' } as const,
      { kind: 'unavailable' } as const,
      { kind: 'failed', reason: 'немає місця' } as const,
    ]) {
      const files = inMemoryBackupFiles({ saveOutcome: outcome });

      expect(await files.save('cap1tal.json', 'x')).toEqual(outcome);
      // Nothing left the phone, so nothing may be claimed to have.
      expect(files.saved()).toEqual([]);
    }
  });

  it('hands back the file the owner picked, unread and unjudged', async () => {
    // Not a бекап at all: judging contents is `readBackup`'s job and no one else's.
    const files = inMemoryBackupFiles({ picked: 'Date,Account,Amount\n' });

    expect(await files.pick()).toEqual({ kind: 'ok', text: 'Date,Account,Amount\n' });
  });

  it('answers each way a pick can end without a file', async () => {
    // No file chosen at all is the owner dismissing the picker.
    expect(await inMemoryBackupFiles().pick()).toEqual({ kind: 'cancelled' });

    const unreadable = inMemoryBackupFiles({
      pickOutcome: { kind: 'unreadable', reason: 'файл не відкривається' },
    });
    expect(await unreadable.pick()).toEqual({
      kind: 'unreadable',
      reason: 'файл не відкривається',
    });
  });
});

describe('what `verify` may load', () => {
  it('never reaches a native module through the port', () => {
    const port = readFileSync(new URL('./backup-file.ts', import.meta.url), 'utf8');

    // The device adapter is a separate file, and this one names it in prose only.
    for (const native of ['expo-file-system', 'expo-document-picker', 'react-native', "from 'expo'"]) {
      expect(port).not.toContain(`import ${native}`);
      expect(port).not.toContain(`from '${native}'`);
    }
  });

  it('is the only file under src/platform that a test imports', () => {
    // The device adapters are proven on the emulator, not here. A test that imported one would
    // bring a native module into `verify` and the whole suite down with it.
    const here = fileURLToPath(new URL('.', import.meta.url));
    const tests = readdirSync(here).filter((name) => name.endsWith('.test.ts'));

    for (const test of tests) {
      const source = readFileSync(new URL(test, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from '\.\/[a-z-]*-device'/);
      expect(source).not.toMatch(/from '\.\/monobank-token-store/);
    }
  });
});
