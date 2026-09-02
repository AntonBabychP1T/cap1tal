import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { inMemoryAnalysisShare } from './analysis-share';

const file = {
  name: 'cap1tal-ai-monthly-picture-2026-07_2026-09.md',
  text: '# cap1tal · AI-аналіз місячної картини\n',
};

describe('the analysis share double', () => {
  it('Scenario: A dismissed chooser is not a failure and not a success', () => {
    // The default outcome, and the whole point of the port: the phone answers the same way whether
    // the owner picked an app or dismissed the chooser, so the app says only that the файл reached
    // the system.
    const share = inMemoryAnalysisShare();

    return share.share(file).then((outcome) => {
      expect(outcome).toEqual({ kind: 'handed-over' });
      expect(share.handed()).toEqual([file]);
    });
  });

  it('hands a файл over and remembers exactly what left', async () => {
    const share = inMemoryAnalysisShare();

    await share.share(file);
    await share.share({ name: 'second.md', text: 'друге' });

    expect(share.handed()).toEqual([file, { name: 'second.md', text: 'друге' }]);
  });

  it('Scenario: A platform without a chooser answers honestly', async () => {
    const share = inMemoryAnalysisShare({ outcome: { kind: 'unavailable' } });

    expect(await share.share(file)).toEqual({ kind: 'unavailable' });
    // Nothing left the phone, so nothing may be claimed to have.
    expect(share.handed()).toEqual([]);
  });

  it('Scenario: A файл that cannot be written is a reason, not a crash', async () => {
    const share = inMemoryAnalysisShare({
      outcome: { kind: 'failed', reason: 'немає місця на пристрої' },
    });

    // A value the screen shows in the owner's words — never a thrown exception.
    expect(await share.share(file)).toEqual({
      kind: 'failed',
      reason: 'немає місця на пристрої',
    });
    expect(share.handed()).toEqual([]);
  });
});

describe('what `verify` may load', () => {
  it('never reaches a native module through the port', () => {
    const port = readFileSync(new URL('./analysis-share.ts', import.meta.url), 'utf8');

    // The device adapter is a separate file, and this one names it in prose only.
    for (const native of ['expo-sharing', 'expo-file-system', 'react-native', "from 'expo'"]) {
      expect(port).not.toContain(`import ${native}`);
      expect(port).not.toContain(`from '${native}'`);
    }
  });

  it('Scenario: No connection is made', () => {
    // An AI-аналіз opens no network connection at any point: not while the пакет is built, not
    // while the файл is rendered, and not while it is handed over. Proven over the source of every
    // file the run passes through, so a `fetch` added later fails here rather than on the phone.
    const analysisDir = fileURLToPath(new URL('../analysis/', import.meta.url));
    const sources = readdirSync(analysisDir)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => ({ name, text: readFileSync(`${analysisDir}${name}`, 'utf8') }));
    sources.push({
      name: 'analysis-share.ts',
      text: readFileSync(new URL('./analysis-share.ts', import.meta.url), 'utf8'),
    });

    expect(sources.length).toBeGreaterThan(10);
    for (const source of sources) {
      for (const network of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
        expect(source.text, `${source.name} names ${network}`).not.toContain(network);
      }
      // The bank is reachable from here only as a type — the rate a пакет was approximated at.
      const monobankImports = source.text.match(/from '\.\.\/monobank\/[a-z-]+'/g) ?? [];
      for (const line of monobankImports) {
        expect(source.text, `${source.name} imports more than the rate type from ${line}`).toContain(
          "import type { MonobankRate } from '../monobank/currency'",
        );
      }
    }
  });
});
