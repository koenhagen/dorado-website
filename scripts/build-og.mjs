/**
 * Regenerates the Open Graph image source from the real site sources, so the
 * social card can never drift away from the hero it is supposed to show.
 *
 * It reads the hero's layers and their depths out of index.html, their art out
 * of assets/svg, their tints and lifts and the sky out of src/style.css, and the
 * wordmark out of assets/logo-letters.svg — including the Cinzel Decorative
 * woff2 that is already embedded there as a data URI — and writes a single
 * self-contained scripts/og.svg.
 *
 *   node scripts/build-og.mjs           # writes scripts/og.svg
 *
 * Rasterising to public/og.png is a separate step because it needs a renderer.
 * Use a browser, which honours the embedded @font-face:
 *
 *   chrome --headless --hide-scrollbars --window-size=1200,630 \
 *     --screenshot=public/og.png file://$PWD/scripts/og.svg
 *
 * The font is also embedded under the name fontconfig reports for the file
 * ("Cinzel Decorative Black"), because other SVG rasterisers resolve families
 * through fontconfig rather than through the @font-face rule, and the mismatch
 * is what silently replaced the wordmark with a default serif in an earlier
 * card.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('index.html');
const logo = read('assets/logo-letters.svg');

// --- the scene -------------------------------------------------------------
const css = read('src/style.css');

const grab = (source, re, what) => {
  const m = source.match(re);
  if (!m) throw new Error(`could not find ${what}`);
  return m[1];
};

// Every layer's art is drawn on this one canvas.
const ART_W = 638.25;
const ART_H = 1385.25;

// The hero's planes, back to front.
const heroScene = grab(
  html,
  /<div class="stretch stretch--hero">[\s\S]*?class="vista__scene"[\s\S]*?>([\s\S]*?)<div class="vista__shade/,
  'the hero scene in index.html',
);
const layers = [...heroScene.matchAll(/data-depth="([\d.]+)">\s*<div class="layer layer--([\w-]+)"/g)].map(
  ([, depth, name]) => {
    const rule = grab(css, new RegExp(`\\.layer--${name} \\{\\s*(--art:[^}]*)\\}`), `the art of ${name}`);
    return {
      name,
      depth: Number(depth),
      file: grab(rule, /url\('\.\.\/([^']+)'\)/, `the art of ${name}`),
      scale: Number(rule.match(/--scale: ([\d.]+)/)?.[1] ?? 1),
      ground: Number(rule.match(/--ground: ([\d.]+)/)?.[1] ?? 0.77),
      tint: grab(css, new RegExp(`\\.stretch--hero \\.layer--${name} \\{ --tint: (#\\w+); \\}`), `the tint of ${name}`),
      lift: Number(css.match(new RegExp(`\\.stretch--hero \\.layer--${name} \\{ --lift: ([\\d.]+); \\}`))?.[1] ?? 0),
    };
  },
);
if (layers.length === 0) throw new Error('no layers found in the hero scene');

// The sky, as a gradient over the 80% of the canvas that .vista__sky covers.
const skyStops = grab(css, /\.stretch--hero \.vista__sky \{\s*background: linear-gradient\(180deg, ([^;]+)\);/, 'the hero sky')
  .split(/,\s*/)
  .map((stop, i) => {
    const [color, offset] = stop.split(' ');
    return `<stop offset="${offset ?? (i === 0 ? '0%' : '100%')}" stop-color="${color}"/>`;
  })
  .join('');

// How far the page has carried the planes when the ground is on screen, as a
// share of the canvas at depth 1. Without it the grounds sit behind one another;
// with it they stand in bands, as they do on the page.
const RISE = 0.117;

// Card only, as a share of the canvas: how much lower a layer sits than on the
// page, to open up the slice the card shows.
const CARD_DROP = { 'dorado-1': 0.15 };

const scene = layers
  .map(({ name, file, tint, lift, depth, scale, ground }) => {
    const art = grab(read(file), /<svg[^>]*>([\s\S]*)<\/svg>/, file);
    const y = ((CARD_DROP[name] ?? 0) - lift - RISE * depth) * ART_H;
    // The solid ground under the art, as in the mask on .layer.
    return `  <g fill="${tint}" transform="translate(0 ${y.toFixed(2)})">
    <rect y="${ART_H * ground}" width="${ART_W}" height="${ART_H}"/>
    <g transform="translate(${(ART_W / 2) * (1 - scale)} ${ART_H * ground * (1 - scale)}) scale(${scale})">
${art}    </g>
  </g>`;
  })
  .join('\n');

// --- the wordmark ----------------------------------------------------------
const fontFaces = logo.match(/@font-face\{[^}]*}/g);
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
// An OG card is 1200x630 (40:21). The scene keeps its full width, so this is a
// slice of the canvas: VIEW_Y is where it starts.
const W = 1200;
const H = 630;
const VIEW_H = (ART_W * H) / W;
const VIEW_Y = 520;

const MARK_W = 300;
const MARK_H = (MARK_W * 230) / 900;
const MARK_X = (ART_W - MARK_W) / 2;
const MARK_Y = VIEW_Y + 30;

const ALT = 'Dawn in the jungle: a golden stepped gateway rising behind layered leaves, with the Dorado wordmark above it.';

const out = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  GENERATED FILE — do not edit by hand.
  Run: node scripts/build-og.mjs
  Source of truth: the hero scene in index.html, src/style.css, assets/svg and
  assets/logo-letters.svg.
-->
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 ${VIEW_Y} ${ART_W} ${VIEW_H}"
     role="img" aria-label="${ALT}">
  <defs>
    <style type="text/css">${faces}</style>
    <linearGradient id="og-sky" x1="0" y1="0" x2="0" y2="1">${skyStops}</linearGradient>
    <radialGradient id="og-shade">
      <stop offset="0%" stop-color="rgb(10,26,38)" stop-opacity="0.72"/>
      <stop offset="55%" stop-color="rgb(10,26,38)" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="rgb(10,26,38)" stop-opacity="0"/>
    </radialGradient>
${logoDefs}
  </defs>
  <rect width="${ART_W}" height="${ART_H * 0.8}" fill="url(#og-sky)"/>
${scene}
  <!-- the dark passage .vista__shade gives the page's headline -->
  <ellipse cx="${ART_W / 2}" cy="${MARK_Y + MARK_H / 2}" rx="${MARK_W * 0.82}" ry="${MARK_H * 1.7}" fill="url(#og-shade)"/>
  <svg x="${MARK_X}" y="${MARK_Y}" width="${MARK_W}" height="${MARK_H}" viewBox="0 0 900 230" overflow="visible">
${logoBody}
  </svg>
</svg>
`;

writeFileSync(join(root, 'scripts/og.svg'), out);
console.log(`wrote scripts/og.svg  (${W}x${H}, ${layers.length} layers: ${layers.map((l) => l.name).join(', ')})`);
