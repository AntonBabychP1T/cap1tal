/**
 * The locator, run once against a real file — decode, downscale, locate, cut, pad, write — so
 * `zbarimg` can confirm the pure TypeScript locator finds the same square the prototype did
 * (design D5) before a native build (task 4) is spent proving it on the device.
 *
 *   npx tsx scripts/qr-quiet-zone-dry-run.ts "2026-09-12 10.30.55.jpg" /tmp/qr-dry-run
 *
 * Run by hand, never by `verify` — like `saldo-dry-run.ts`, this reads a file outside the repo and
 * writes files nobody commits. The downscale here is a plain box filter, not
 * `expo-image-manipulator`'s own resize, so this proves only the locator's own logic; the emulator
 * smoke (task 4) is what proves the real pipeline end to end.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { decode, encode } from 'jpeg-js';

import { cutRect, findQrSquares, marginFor, padWithMargin, type Rect, type RawImage } from '../src/platform/qr-quiet-zone';

const WORKING_WIDTH = 360;

const [, , imagePath, outDir] = process.argv;
if (imagePath === undefined || outDir === undefined) {
  console.error('usage: npx tsx scripts/qr-quiet-zone-dry-run.ts <image> <scratch dir>');
  process.exit(2);
}

const bytes = readFileSync(imagePath);
const original: RawImage = decode(bytes, { useTArray: true });
console.log(`decoded: ${original.width}x${original.height}`);

const working = original.width > WORKING_WIDTH ? boxDownscale(original, WORKING_WIDTH) : original;
console.log(`working copy: ${working.width}x${working.height}`);

const candidates = findQrSquares(working);
console.log(`candidates: ${candidates.length}`);

mkdirSync(outDir, { recursive: true });

for (const [i, candidate] of candidates.entries()) {
  const rect = cutRect(candidate, working.width, original.width, original.height);
  const margin = marginFor(rect);
  console.log(`  candidate ${i + 1}: rect ${JSON.stringify(rect)} margin ${margin}`);

  const cropped = cropOf(original, rect);
  const padded = padWithMargin(cropped, margin);
  const jpeg = encode({ width: padded.width, height: padded.height, data: padded.data }, 92);

  const outPath = join(outDir, `candidate-${i + 1}.jpg`);
  writeFileSync(outPath, jpeg.data);
  console.log(`  wrote ${outPath}`);
}

if (candidates.length === 0) {
  console.log('no candidates found');
}

/** A plain box filter downscale to `targetWidth`, preserving aspect ratio — Node has no canvas. */
function boxDownscale(image: RawImage, targetWidth: number): RawImage {
  const scale = image.width / targetWidth;
  const targetHeight = Math.max(1, Math.round(image.height / scale));
  const data = new Uint8Array(targetWidth * targetHeight * 4);

  for (let ty = 0; ty < targetHeight; ty++) {
    const sy0 = Math.floor(ty * scale);
    const sy1 = Math.min(image.height, Math.max(sy0 + 1, Math.floor((ty + 1) * scale)));
    for (let tx = 0; tx < targetWidth; tx++) {
      const sx0 = Math.floor(tx * scale);
      const sx1 = Math.min(image.width, Math.max(sx0 + 1, Math.floor((tx + 1) * scale)));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const o = (sy * image.width + sx) * 4;
          r += image.data[o] as number;
          g += image.data[o + 1] as number;
          b += image.data[o + 2] as number;
          a += image.data[o + 3] as number;
          count += 1;
        }
      }

      const to = (ty * targetWidth + tx) * 4;
      data[to] = Math.round(r / count);
      data[to + 1] = Math.round(g / count);
      data[to + 2] = Math.round(b / count);
      data[to + 3] = Math.round(a / count);
    }
  }

  return { width: targetWidth, height: targetHeight, data };
}

/** Crops `rect` out of `image` — a plain pixel copy, no native module. */
function cropOf(image: RawImage, rect: Rect): RawImage {
  const data = new Uint8Array(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const sourceStart = ((rect.y + y) * image.width + rect.x) * 4;
    const destStart = y * rect.width * 4;
    data.set(image.data.subarray(sourceStart, sourceStart + rect.width * 4), destStart);
  }
  return { width: rect.width, height: rect.height, data };
}
