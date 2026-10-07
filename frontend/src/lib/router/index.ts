/**
 * 路由模块统一出口
 *
 * - 导航/路径常量写在本文件，且不依赖任何页面组件，避免「出口 ← 页面 ← 出口」循环依赖；
 * - 运行时（真实路径 history 路由）来自 ./router.svelte；
 * - 路由表（路径 → 页面组件，会 import 所有页面）单独放在 ./routes。
 *
 * 页面统一 `import { push, router } from '$lib/router'`。
 */
export { installRouter, navigate, normalizePath, push, replace, resolveRoute, router } from './router.svelte';
export type { InstallOptions, RouteMap, RouterState } from './router.svelte';

/** 五个模块路径（与需求逐字一致） */
export const ROUTES = {
  stones: '/stones',
  designs: '/designs',
  carve: '/carve',
  impressions: '/impressions',
  catalog: '/catalog'
} as const;

/** 根路径规范化后的默认模块 */
export const DEFAULT_PATH: string = ROUTES.stones;

export interface NavItem {
  path: string;
  label: string;
  /** 顶部导航的简要说明 */
  desc: string;
}

export const NAV_ITEMS: NavItem[] = [
  { path: ROUTES.stones, label: '印石台账', desc: '石种 · 钮式 · 闲置' },
  { path: ROUTES.designs, label: '印稿设计', desc: '朱白文 · 边框 · 采用稿' },
  { path: ROUTES.carve, label: '刻制工序', desc: '刀法排序 · 完成回写' },
  { path: ROUTES.impressions, label: '钤印记录', desc: '印泥 · 压力 · 评级' },
  { path: ROUTES.catalog, label: '印谱汇总', desc: '排序 · 收录 · 导出' }
];

/** 已注册的路径（用于判断当前路径是否合法） */
export const KNOWN_PATHS: string[] = NAV_ITEMS.map((item) => item.path);

/** 路径 → 导航高亮项（未知路径不高亮） */
export function activeNav(path: string): string {
  return NAV_ITEMS.find((item) => path === item.path || path.startsWith(`${item.path}/`))?.path ?? '';
}
