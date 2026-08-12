import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the built assets resolve correctly whether this is
  // served from a GitHub Pages project subpath or a root domain
  base: './',
});
