import { defineConfig } from 'vite';

// One landing page: The Open Basin, at the root. The six earlier directions
// and the chooser that indexed them have been retired.
export default defineConfig({
  // Relative, so the same build works at a GitHub Pages project path
  // (/dorado-website/) and at the apex of getdorado.app. A hardcoded base
  // would have to change the day the custom domain goes live.
  base: './',
});
