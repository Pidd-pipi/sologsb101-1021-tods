/**
 * 应用引导（TypeScript）
 * 以真实路径（history）模式安装路由，再挂载 Svelte 5 应用到 #app；
 * IndexedDB 初始化与 store 载入在 App.svelte 的 onMount 中完成。
 */
import { mount } from 'svelte';
import App from './App.svelte';
import { DEFAULT_PATH, installRouter } from '$lib/router';
import './app.css';

/** 挂载入口：由 src/main.js 调用 */
export function bootstrap(target: HTMLElement): void {
  // 首屏按 location.pathname 匹配模块（/stones、/designs…），根路径规范化为默认模块 /stones
  installRouter({ defaultPath: DEFAULT_PATH });
  mount(App, { target });
}
