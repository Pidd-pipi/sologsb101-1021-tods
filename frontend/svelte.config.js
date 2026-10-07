import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Svelte 5 + TypeScript：使用 vitePreprocess 处理 <script lang="ts"> */
export default {
  preprocess: vitePreprocess(),
};
