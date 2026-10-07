import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';

// 纯前端 SPA：产物交给 nginx:alpine 托管，开发端口与宿主映射端口一致（22821）
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 22821,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 22821,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
