/**
 * Rewrite the two golden файли для аналізу from the one fixture.
 *
 *   npx tsx scripts/regen-analysis-goldens.ts
 *
 * Run by hand, deliberately, when a wording of the файл changes on purpose — never by `verify`,
 * which only ever compares. The goldens are the review surface for everything that leaves the
 * phone: a change to them is meant to appear in a diff and be read, not to be produced as a side
 * effect of running the tests.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderDocument } from '../src/analysis/document';
import { fixturePackage } from '../src/analysis/document.fixture';

const goldens = [
  { file: 'document.golden.md', included: { descriptions: false, transactions: false } },
  { file: 'document-detailed.golden.md', included: { descriptions: true, transactions: true } },
];

for (const golden of goldens) {
  const path = fileURLToPath(new URL(`../src/analysis/${golden.file}`, import.meta.url));
  const rendered = renderDocument(fixturePackage(golden.included), 'external-advanced');
  writeFileSync(path, rendered.text, 'utf8');
  console.log(`wrote src/analysis/${golden.file} (${rendered.text.length} chars)`);
}
