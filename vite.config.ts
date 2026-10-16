import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '0.0.0.0' },
  build: { rollupOptions: { output: { manualChunks: id => id.includes('/node_modules/three/') ? 'three' : undefined } } },
});
