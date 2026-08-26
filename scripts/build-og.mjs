/**
 * Regenerates the Open Graph image source from the real site sources, so the
 * social card can never drift away from the hero it is supposed to show.
 *
 * It reads the hero vista out of index.html and the wordmark out of
 * assets/logo-letters.svg — including the Cinzel Decorative woff2 that is
 * already embedded there as a data URI — and writes a single self-contained
 * scripts/og.svg.
 *
 *   node scripts/build-og.mjs           # writes scripts/og.svg
 *
 * Rasterising to public/og.png is a separate step because it needs a renderer;
 * see scripts/README.md. The font is embedded in the SVG under BOTH the CSS
 * family name and the name fontconfig reports for the file ("Cinzel Decorative
 * Black"), because SVG rasterisers resolve families through fontconfig rather
 * than through the @font-face rule, and the mismatch is what silently replaced
 * the wordmark with a default serif in the previous card.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('index.html');
const logo = read('assets/logo-letters.svg');

// --- the scene -------------------------------------------------------------
// The gradients live in a shared <svg class="defs"> block, the landscape in the
// hero's own <svg class="vista__scene">. Both are lifted verbatim.
const grab = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error(`could not find ${what} in index.html`);
  return m[1];
};

const defs = grab(/<svg class="defs"[^>]*>\s*(<defs>[\s\S]*?<\/defs>)/, 'the gradient defs');
const scene = grab(
  /<section class="vista vista--hero">[\s\S]*?<svg\s+class="vista__scene"[^>]*>([\s\S]*?)<\/svg>/,
  'the hero scene',
);

// --- the wordmark ----------------------------------------------------------
const fontFaces = logo.match(/@font-face\{[^}]*\}/g);
if (!fontFaces?.length) throw new Error('no @font-face found in logo-letters.svg');

// Same bytes, re-declared under the fontconfig family name.
const FC_NAME = 'Cinzel Decorative Black';
const faces = [
  ...fontFaces,
  ...fontFaces.map((f) => f.replace(/font-family:'[^']*'/, `font-family:'${FC_NAME}'`)),
].join('\n');

// Everything after the logo's own <defs>, minus its closing tag: the layered
// shadow / groove / rim treatment that makes the wordmark what it is.
const logoBody = logo
  .replace(/^[\s\S]*?<\/defs>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/font-family="'Cinzel Decorative',serif"/g, `font-family="'${FC_NAME}','Cinzel Decorative',serif"`);

const logoDefs = logo
  .match(/<defs>([\s\S]*?)<\/defs>/)[1]
  .replace(/<style[\s\S]*?<\/style>/, '')
  .replace(/font-family="'Cinzel Decorative',serif"/g, `font-family="'${FC_NAME}','Cinzel Decorative',serif"`);

// --- composition -----------------------------------------------------------
// The hero is authored 1600x900 (16:9); an OG card is 1200x630 (40:21). Cropping
// 30 units off the top and bottom reaches 40:21 without distorting the ridges.
const W = 1200;
const H = 630;
const VIEW = '0 30 1600 840';

// The wordmark sits in clear sky above the dawn cloud banks, which begin around
// y=356. Dropping it any lower puts a pale cloud edge straight through the
// grooves in the letterforms.
const MARK_W = 720;
const MARK_H = Math.round((MARK_W * 230) / 900);
const MARK_X = (1600 - MARK_W) / 2;
const MARK_Y = 105;

const out = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  GENERATED FILE — do not edit by hand.
  Run: node scripts/build-og.mjs
  Source of truth: the hero vista in index.html and assets/logo-letters.svg.
-->
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${VIEW}"
     role="img" aria-label="Dawn over an open jungle basin between two forested bluffs, with the Dorado wordmark above the far ridge.">
  <defs>
    <style type="text/css">${faces}</style>
${logoDefs}
  </defs>
${defs}
${scene}
  <svg x="${MARK_X}" y="${MARK_Y}" width="${MARK_W}" height="${MARK_H}" viewBox="0 0 900 230" overflow="visible">
${logoBody}
  </svg>
</svg>
`;

writeFileSync(join(root, 'scripts/og.svg'), out);
console.log(`wrote scripts/og.svg  (${W}x${H}, wordmark ${MARK_W}x${MARK_H} at ${MARK_X},${MARK_Y})`);
