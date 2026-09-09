import { defineConfig } from 'astro/config';
// RyuChan's Astro static architecture, trimmed to the four server sections.
export default defineConfig({ output: 'static', vite: { server: { proxy: {
  '/api': 'http://127.0.0.1:8787', '/tiles': 'http://127.0.0.1:8787'
} } } });
