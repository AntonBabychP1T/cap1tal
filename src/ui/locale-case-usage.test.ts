import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * No locale-argument case mapping in code (search-fold-speed design D4). On Hermes each call goes
 * through the platform's Intl bridge (~0.4 ms), which made one search on a long history a
 * 16-second stall; `foldCase` (`src/domain/fold.ts`) is the one fold. Tests are exempt — the fold
 * test must call the `uk` mapping to compare — and so are comments.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * Blanks `/* … *\/` blocks (keeping their newlines, so line numbers hold) and `//` tails. A `//`
 * inside a string can only hide a call later on that line, never report a false one.
 */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

describe('case is folded through foldCase', () => {
  it('Scenario: A phone set to Turkish still finds a Latin опис', () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      withoutComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          if (/\btoLocale(Lower|Upper)Case\(/.test(line)) {
            offenders.push(`${relative(SRC, file)}:${index + 1}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
