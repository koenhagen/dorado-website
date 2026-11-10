import { defineConfig, type Plugin } from 'vite';
import { copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The confirmation mail links to /thanks, and a static host will answer that
 * with whichever of `thanks.html` or `thanks/index.html` it happens to find —
 * GitHub Pages prefers the file, `vite preview` only resolves the directory,
 * and neither redirects to the other. So ship both: build the directory, then
 * drop a byte-identical copy at the root.
 *
 * No path rewriting is needed for the copy. The page's asset links are all
 * `../assets/…`, which resolves to `/assets/…` from `/thanks/` and, because a
 * browser clamps `..` at the origin root, to the same place from `/thanks`.
 */
function thanksWithoutTheSlash(): Plugin {
  return {
    name: 'dorado:thanks-without-the-slash',
    apply: 'build',
    async closeBundle() {
      await copyFile(here('dist/thanks/index.html'), here('dist/thanks.html'));
    },
  };
}

/**
 * HTML partials: `<!-- @include footer -->` in a page is replaced by
 * src/partials/footer.html, in dev and in the build. Runs before Vite reads
 * the page's asset links, so the partial's `/assets/…` paths are bundled and
 * rewritten like any written in the page itself.
 *
 * The link to the page being viewed gets aria-current="page", worked out from
 * the page's own path (about/index.html → /about/).
 */
function htmlPartials(): Plugin {
  const dir = here('src/partials/');

  return {
    name: 'dorado:html-partials',
    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        const page = ctx.path.replace(/index\.html$/, '').replace(/\.html$/, '/');
        const includes = [...html.matchAll(/<!--\s*@include\s+([\w-]+)\s*-->/g)];

        for (const [marker, name] of includes) {
          let partial = await readFile(`${dir}${name}.html`, 'utf8');
          partial = partial.replace(
            new RegExp(`<a href="${page}">`, 'g'),
            `<a href="${page}" aria-current="page">`,
          );
          html = html.replace(marker, partial.trim());
        }
        return html;
      },
    },
    // A page doesn't import its partials, so Vite can't see that a change to
    // one affects it: reload the browser instead.
    handleHotUpdate({ file, server }) {
      if (file.startsWith(dir)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

// One landing page: The Open Basin, at the root. The six earlier directions
// and the chooser that indexed them have been retired.
//
// Plus /about, /privacy and /terms, the plain text pages linked from every
// footer. They share src/page.css.
//
// Plus /thanks, where the confirmation link in the beta mail lands. It is an
// entry rather than a file in /public so it can share the built stylesheet and
// the hashed font and image assets.
export default defineConfig({
  plugins: [htmlPartials(), thanksWithoutTheSlash()],

  build: {
    rollupOptions: {
      input: {
        main: here('index.html'),
        thanks: here('thanks/index.html'),
        about: here('about/index.html'),
        contact: here('contact/index.html'),
        privacy: here('privacy/index.html'),
        terms: here('terms/index.html'),
      },
    },
  },

  // Relative, so the same build works at a GitHub Pages project path
  // (/dorado-website/) and at the apex of the custom domain. A hardcoded base
  // would have to change the day that domain goes live.
  base: './',
});
