import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

/**
 * `src/fiscal/` is pure TypeScript, exactly as `src/saldo/` and `src/notifications/` are: it reads
 * a QR's text, decodes a document, parses two XML dialects and maps one HTTP answer, and it does
 * all of that over values passed in.
 *
 * That is not a style preference. Every rule about a чек — what a позиція is, which document is
 * refused, which answer is `not-found` rather than `unavailable` — is proven here under `verify`,
 * which runs no React Native, loads no Expo module and opens no database. One import of any of
 * them would take the whole of that with it, and the import that does it is the easy one to add.
 *
 * Asserted over the directory rather than file by file, so a file added later is covered the day
 * it appears instead of the day someone remembers to extend a list.
 */

const here = fileURLToPath(new URL('.', import.meta.url));

/** What a module here may reach for: the domain's own values, its siblings, and the XML parser. */
const ALLOWED_PREFIXES = ['../domain/', './'];
const ALLOWED_PACKAGES = ['fast-xml-parser'];

/** What none of them may reach for, whatever it is called. */
const FORBIDDEN = ['react', 'react-dom', 'react-native', 'expo', '../db/', '../platform/', '../app/'];

/**
 * The module specifiers of every `import`/`export … from` — matched within one line, since a
 * `[^'"]*` that may cross newlines happily runs from an `export interface` down to the first
 * quoted string in a doc comment and calls it an import.
 */
function modulesOf(source: string): string[] {
  return [...source.matchAll(/^\s*(?:import|export)[^'"\n]*from ['"]([^'"]+)['"]/gm)].map(
    ([, from]) => from as string,
  );
}

function sourcesHere(): string[] {
  return readdirSync(here).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
}

it('every module under src/fiscal imports only the domain, its siblings and the XML parser', () => {
  const files = sourcesHere();
  // A guard over an empty directory proves nothing; if the module is ever emptied, say so loudly.
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    const imported = modulesOf(readFileSync(new URL(file, import.meta.url), 'utf8'));
    for (const module of imported) {
      const allowed =
        ALLOWED_PACKAGES.includes(module) ||
        ALLOWED_PREFIXES.some((prefix) => module.startsWith(prefix));
      expect(allowed, `${file} imports "${module}"`).toBe(true);
    }
  }
});

it('no module under src/fiscal names React, Expo, React Native or the database at all', () => {
  for (const file of sourcesHere()) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const forbidden of FORBIDDEN) {
      // The quoted form, so prose in a comment may still explain why the thing is absent.
      expect(source, `${file} imports "${forbidden}"`).not.toContain(`from '${forbidden}`);
      expect(source, `${file} requires "${forbidden}"`).not.toContain(`require('${forbidden}`);
    }
    // A side-effect import names no binding and so slips past the list above. Nothing here needs
    // one: every module in this directory is a function of its arguments.
    expect(source, `${file} has a side-effect import`).not.toMatch(/^\s*import\s+['"]/m);
  }
});

it('nothing under src/fiscal reaches the network except through a transport passed to it', () => {
  for (const file of sourcesHere()) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    // `fetch` as a global is the one seam that would let a parser or the domain quietly call the
    // tax service. The adapter takes its transport as an argument; nothing here calls one it
    // found lying around. (`FetchLike` and `fetchImpl` are the parameter's own names.)
    expect(source, `${file} calls a global fetch`).not.toMatch(/[^.\w]fetch\s*\(/);
  }
});
