#!/usr/bin/env node
/**
 * Builds `docs/app-overview.docx` from `docs/app-overview.md` and the PNGs in `docs/screens/`.
 *
 *   node scripts/build-overview-docx.mjs
 *
 * Run by hand, never by `verify` — the output is a 3 MB binary that duplicates the Markdown, so
 * it is gitignored and rebuilt whenever the overview changes. The Markdown stays the source; if
 * the two disagree, this script is what makes them agree again.
 *
 * The one dependency (`docx`, npm) is deliberately *not* in package.json: nothing the app ships
 * needs it, and adding it would put a devDependency in front of every `npm ci` and every CI run
 * for a document. It is installed on demand into `.cache/docx-tools/`, which is gitignored like
 * the rest of `.cache/`.
 *
 * This is a converter for exactly the Markdown that one file uses — headings, paragraphs, pipe
 * tables, fenced code, bullet and ordered lists, horizontal rules, and rows of `<img>` tags. It
 * is not a general Markdown implementation and does not try to be one.
 *
 * `PROBE_SLICE=<from>-<to> PROBE_OUT=<name.docx>` builds only those lines of the Markdown into a
 * throwaway document — how a page in the middle gets looked at without rendering all of it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const TOOLS = path.join(ROOT, '.cache', 'docx-tools');

/**
 * `docx` from the tools cache, installed the first time it is missing. The entry file is named
 * outright rather than resolved: the package's `exports` map hides its own package.json, so
 * `require.resolve('docx/package.json')` — the usual way to find where a package landed — throws.
 */
const DOCX_ENTRY = path.join('node_modules', 'docx', 'dist', 'index.mjs');

async function loadDocx() {
  for (const base of [TOOLS, ROOT]) {
    const entry = path.join(base, DOCX_ENTRY);
    if (existsSync(entry)) return import(pathToFileURL(entry).href);
  }
  console.log('installing docx into .cache/docx-tools (once) …');
  mkdirSync(TOOLS, { recursive: true });
  if (!existsSync(path.join(TOOLS, 'package.json'))) {
    writeFileSync(
      path.join(TOOLS, 'package.json'),
      `${JSON.stringify({ name: 'cap1tal-docx-tools', private: true }, null, 2)}\n`,
    );
  }
  execFileSync('npm', ['install', '--silent', '--no-fund', '--no-audit', 'docx'], {
    cwd: TOOLS,
    stdio: 'inherit',
  });
  const entry = path.join(TOOLS, DOCX_ENTRY);
  if (!existsSync(entry)) throw new Error(`docx installed but ${entry} is missing`);
  return import(pathToFileURL(entry).href);
}

const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, LevelFormat, PageNumber,
  Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} = await loadDocx();

let md = readFileSync(path.join(DOCS, 'app-overview.md'), 'utf8').split('\n');
const SLICE = process.env.PROBE_SLICE;
const OUT_NAME = process.env.PROBE_OUT || 'app-overview.docx';
if (SLICE) {
  const [from, to] = SLICE.split('-').map(Number);
  md = [md[0], '', ...md.slice(from - 1, to)];
}

const BODY = 'Arial';
const MONO = 'Courier New';
// Both exist on macOS and on Windows. Calibri and Consolas do not: on a Mac without Office they
// fall back to a serif, and a proportional fallback would break the code blocks' alignment.

const CODE_SHADE = 'F2F1EE';
const MARGIN_DXA = 1008;                       // 0.7"
const TEXT_DXA = 11906 - 2 * MARGIN_DXA;       // A4 portrait minus the margins
const TEXT_PT = (TEXT_DXA / 1440) * 72;

/* ── inline markdown ─────────────────────────────────────────────────────── */

const SOURCE_PATH = /^(src|modules|scripts|openspec|drizzle|assets)\//;

/**
 * A link becomes the path it points at when that path is source, and its own label otherwise.
 * The document is read outside the repository, where a relative link resolves to nothing — the
 * useful half of `[_layout.tsx](../src/app/_layout.tsx)` is the path, and of
 * `[правила](../.claude/rules/android.md)` it is also the path; of `[glossary.md](glossary.md)`
 * the label already is one.
 */
function linkText(label, dest) {
  const clean = dest.replace(/^<|>$/g, '').replace(/^(\.\.\/)+/, '');
  if (SOURCE_PATH.test(clean) || clean.startsWith('.claude/')) return { text: clean, code: true };
  return { text: label, code: false };
}

function unescape(s) {
  return s.replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&amp;/g, '&');
}

/** `**bold**`, `` `code` `` and `[label](dest)` into runs; everything else is plain. */
function runs(text, baseIn = {}) {
  const base = { font: BODY, ...baseIn };
  const out = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((<[^>]*>|[^)]*)\)/g;
  let at = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > at) out.push(new TextRun({ ...base, text: unescape(text.slice(at, m.index)) }));
    if (m[1] !== undefined) {
      // Recursive, because a bold span can hold a code span — «**`npm run verify` ніколи…**».
      out.push(...runs(m[1], { ...base, bold: true }));
    } else if (m[2] !== undefined) {
      out.push(new TextRun({ ...base, text: unescape(m[2]), font: MONO, size: 18 }));
    } else {
      const link = linkText(unescape(m[3]), m[4]);
      out.push(new TextRun(
        link.code ? { ...base, text: link.text, font: MONO, size: 18 } : { ...base, text: link.text },
      ));
    }
    at = re.lastIndex;
  }
  if (at < text.length) out.push(new TextRun({ ...base, text: unescape(text.slice(at)) }));
  return out.length > 0 ? out : [new TextRun({ ...base, text: '' })];
}

/* ── block builders ──────────────────────────────────────────────────────── */

const body = [];

function para(text, opts = {}) {
  body.push(new Paragraph({ children: runs(text), spacing: { after: 140 }, ...opts }));
}

function heading(text, level) {
  body.push(new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 360 : 280, after: 140 },
    children: runs(text),
  }));
}

/** Box drawing has no guaranteed monospace glyph; ASCII keeps the diagram aligned everywhere. */
const BOX = { '─': '-', '│': '|', '┘': '+', '├': '+', '┤': '+',
              '►': '>', '◄': '<' };
function asciiBox(line) {
  return line.replace(/[─│┘├┤►◄]/g, (c) => BOX[c]);
}

function codeBlock(rawLines) {
  const lines = rawLines.map(asciiBox);
  // Courier New advances 0.6 em, so the widest line decides the size the block can keep on one
  // line each. A wrapped line in an aligned diagram is worse than a small one.
  const widest = Math.max(...lines.map((l) => l.length), 1);
  const size = Math.max(14, Math.min(18, Math.floor((2 * TEXT_PT) / (widest * 0.6))));
  lines.forEach((line, i) => body.push(new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: CODE_SHADE },
    spacing: { before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 160 : 0, line: 240 },
    children: [new TextRun({ text: line || ' ', font: MONO, size })],
  })));
}

function rule() {
  body.push(new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9C4BA', space: 1 } },
    children: [new TextRun('')],
  }));
}

/** One row of screenshots, inline in a single centred paragraph. */
function images(files) {
  const width = files.length >= 3 ? 200 : 240;
  const height = Math.round((width * 1205) / 540);
  const children = [];
  files.forEach((file, i) => {
    if (i > 0) children.push(new TextRun({ text: '  ' }));
    children.push(new ImageRun({
      type: 'png',
      data: readFileSync(path.join(DOCS, file)),
      transformation: { width, height },
    }));
  });
  body.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 200 },
    children,
  }));
}

function table(rows) {
  const cols = rows[0].length;
  const widths = cols === 3
    ? [1200, TEXT_DXA - 2800, 1600]
    : [2400, TEXT_DXA - 2400];
  body.push(new Table({
    columnWidths: widths,
    width: { size: TEXT_DXA, type: WidthType.DXA },
    rows: rows.map((cells, r) => new TableRow({
      tableHeader: r === 0,
      children: cells.map((cell, c) => new TableCell({
        width: { size: widths[c], type: WidthType.DXA },
        shading: r === 0 ? { type: ShadingType.CLEAR, fill: 'EFEBE2' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({
          spacing: { before: 20, after: 20 },
          children: runs(cell, r === 0 ? { bold: true } : {}),
        })],
      })),
    })),
  }));
  body.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun('')] }));
}

let bulletCount = 0;
function listItem(text, ordered, instance) {
  body.push(new Paragraph({
    numbering: { reference: ordered ? 'ordered' : 'bullets', level: 0, instance },
    spacing: { after: 60 },
    children: runs(text),
  }));
}

/* ── the parse ───────────────────────────────────────────────────────────── */

const IMG = /<img\s+src="([^"]+)"[^>]*>/g;
let i = 0;
let orderedInstance = 0;

// The H1 becomes the document title, set apart from the body.
while (i < md.length && !md[i].startsWith('# ')) i += 1;
body.push(new Paragraph({
  spacing: { after: 80 },
  children: [new TextRun({ text: md[i].slice(2), bold: true, size: 44, font: BODY })],
}));
body.push(new Paragraph({
  spacing: { after: 320 },
  children: [new TextRun({
    text: 'Огляд застосунку та його архітектури · знімки з емулятора · 2026-09-01',
    color: '6B6459', size: 20, font: BODY,
  })],
}));
body.push(new Paragraph({
  spacing: { after: 120 },
  children: [new TextRun({ text: 'Зміст', bold: true, size: 26, font: BODY })],
}));
// Written out rather than left as a TOC field: a field is empty until the reader's editor
// updates it, and Pages and Google Docs never do.
for (const line of md) {
  const h2 = /^## (.+)$/.exec(line);
  const h3 = /^### (.+)$/.exec(line);
  if (!h2 && !h3) continue;
  body.push(new Paragraph({
    spacing: { after: 40 },
    indent: { left: h3 ? 460 : 0 },
    children: [new TextRun({
      text: (h2 || h3)[1].replace(/`/g, ''),
      bold: Boolean(h2),
      size: h3 ? 19 : 21,
      color: h3 ? '4A443B' : '1A1815',
      font: BODY,
    })],
  }));
}
rule();
i += 1;

while (i < md.length) {
  const line = md[i];

  if (line.trim() === '') { i += 1; continue; }

  if (line.startsWith('### ')) { heading(line.slice(4), HeadingLevel.HEADING_3); i += 1; continue; }
  if (line.startsWith('## ')) { heading(line.slice(3), HeadingLevel.HEADING_2); i += 1; continue; }
  if (line.startsWith('# ')) { heading(line.slice(2), HeadingLevel.HEADING_1); i += 1; continue; }

  if (line.trim() === '---') { rule(); i += 1; continue; }

  if (line.startsWith('```')) {
    const lines = [];
    i += 1;
    while (i < md.length && !md[i].startsWith('```')) { lines.push(md[i]); i += 1; }
    i += 1;
    codeBlock(lines);
    continue;
  }

  if (line.startsWith('<img ')) {
    images([...line.matchAll(IMG)].map((m) => m[1]));
    i += 1;
    continue;
  }

  if (line.startsWith('|')) {
    const rows = [];
    while (i < md.length && md[i].startsWith('|')) {
      const cells = md[i].slice(1, md[i].replace(/\|\s*$/, '|').length - 1).split('|').map((c) => c.trim());
      // The `|---|---|` separator row is a rule, not data.
      if (!/^[-:\s|]+$/.test(md[i].replace(/\|/g, ''))) rows.push(cells);
      i += 1;
    }
    table(rows);
    continue;
  }

  if (/^\d+\.\s/.test(line) || line.startsWith('- ')) {
    const ordered = /^\d+\.\s/.test(line);
    if (ordered) orderedInstance += 1;
    // A fresh numbering instance per list, or every ordered list would continue the previous one.
    const instance = ordered ? orderedInstance : (bulletCount += 1);
    while (i < md.length && md[i].trim() !== '') {
      let text = md[i].replace(/^(\d+\.|-)\s+/, '');
      i += 1;
      // Continuation lines of one item are indented; fold them into it.
      while (i < md.length && /^\s{2,}\S/.test(md[i])) { text += ` ${md[i].trim()}`; i += 1; }
      listItem(text, ordered, instance);
    }
    continue;
  }

  // An ordinary paragraph: every line until a blank one or the start of another block.
  let text = line;
  i += 1;
  while (i < md.length && md[i].trim() !== '' && !md[i].startsWith('<img ')
         && !md[i].startsWith('|') && !md[i].startsWith('#') && !md[i].startsWith('```')
         && md[i].trim() !== '---' && !/^\d+\.\s/.test(md[i]) && !md[i].startsWith('- ')) {
    text += ` ${md[i].trim()}`;
    i += 1;
  }
  para(text);
}

/* ── the document ────────────────────────────────────────────────────────── */

const doc = new Document({
  creator: 'cap1tal',
  title: 'cap1tal — огляд застосунку',
  description: 'Функціональний опис, архітектура та знімки екранів',
  styles: {
    default: {
      document: { run: { font: BODY, size: 21 }, paragraph: { spacing: { line: 276 } } },
      heading1: { run: { font: BODY, size: 32, bold: true, color: '1A1815' } },
      heading2: { run: { font: BODY, size: 27, bold: true, color: '1A1815' } },
      heading3: { run: { font: BODY, size: 23, bold: true, color: '3A342C' } },
    },
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 240 } } },
        }],
      },
      {
        reference: 'ordered',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 240 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: { margin: { top: 1134, bottom: 1134, left: MARGIN_DXA, right: MARGIN_DXA } },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            children: ['cap1tal — огляд застосунку · ', PageNumber.CURRENT],
            size: 16, color: '8A8377', font: BODY,
          })],
        })],
      }),
    },
    children: body,
  }],
});

const out = path.join(DOCS, OUT_NAME);
const buffer = await Packer.toBuffer(doc);
writeFileSync(out, buffer);
console.log(`wrote ${path.relative(ROOT, out)} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
