import { defineConfig, type Plugin } from 'vite';
import { copyFile } from 'node:fs/promises';
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

// One landing page: The Open Basin, at the root. The six earlier directions
// and the chooser that indexed them have been retired.
//
// Plus /thanks, where the confirmation link in the beta mail lands. It is an
// entry rather than a file in /public so it can share the built stylesheet and
// the hashed font and image assets.
export default defineConfig({
  plugins: [thanksWithoutTheSlash()],

  build: {
    rollupOptions: {
      input: {
        main: here('index.html'),
        thanks: here('thanks/index.html'),
      },
    },
  },

  // Relative, so the same build works at a GitHub Pages project path
  // (/dorado-website/) and at the apex of the custom domain. A hardcoded base
  // would have to change the day that domain goes live.
  base: './',
});
