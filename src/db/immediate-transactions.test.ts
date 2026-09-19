import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Every real write transaction takes its write lock at `BEGIN`, not on its first write statement
 * (design D4) — a deferred transaction's upgrade does not wait, so a change that reads before it
 * stores would otherwise fail at once instead of waiting its turn. Reads the source rather than
 * running it: a behaviour test proves one call waits and lands (concurrency.test.ts), this proves
 * every call is written to.
 */

const DB_DIR = fileURLToPath(new URL('.', import.meta.url));

function sourceFiles(): string[] {
  return readdirSync(DB_DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort();
}

/**
 * Every `.transaction(...)` call's own source, matched by paren/brace depth from the call's
 * opening `(` to its closing `)` — the callback body can run to dozens of lines, so a line-by-line
 * match would pass or fail by accident.
 */
function transactionCalls(source: string): string[] {
  const calls: string[] = [];
  const needle = '.transaction(';
  let cursor = 0;
  for (;;) {
    const start = source.indexOf(needle, cursor);
    if (start === -1) break;
    const openParen = start + needle.length - 1;
    let depth = 0;
    let end = openParen;
    for (; end < source.length; end++) {
      if (source[end] === '(' || source[end] === '{') depth++;
      else if (source[end] === ')' || source[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) {
      throw new Error(`unbalanced .transaction(...) call starting at index ${start}`);
    }
    calls.push(source.slice(start, end + 1));
    cursor = end + 1;
  }
  return calls;
}

describe('every write transaction takes its lock at the start', () => {
  for (const file of sourceFiles()) {
    const source = readFileSync(`${DB_DIR}${file}`, 'utf8');
    const calls = transactionCalls(source);
    if (calls.length === 0) {
      continue;
    }
    it(`${file}: every .transaction(...) call names behavior: 'immediate'`, () => {
      for (const call of calls) {
        expect(call).toContain("behavior: 'immediate'");
      }
    });
  }
});
