/**
 * 极简 history 路由运行时（真实路径模式，不使用 hash）
 *
 * 设计目标：
 * 1. 首屏直接按 window.location.pathname 匹配模块，深链 /tunings、/voicings 等刷新即可命中；
 * 2. 站内 <a href="/xxx"> 点击由 document 级事件委托拦截，改用 history.pushState，
 *    URL 与页面内容始终同步（不会只变内容不变地址，也不会只变地址不变内容）；
 * 3. 监听 popstate，浏览器前进/后退与地址栏直接改地址都能正确响应；
 * 4. 旧版 hash 深链（/#/tunings）自动迁移为真实路径，保证老书签仍可用。
 *
 * 依赖 nginx / vite preview 的 SPA fallback（try_files $uri $uri/ /index.html），
 * 未知路径由服务器回退 index.html，再由前端路由表兜底渲染。
 */
import type { Component } from 'svelte';

export interface RouterState {
  /** 当前路径（不含 query），例如 /tunings */
  location: string;
  /** 当前查询串（含前导 ?），无查询时为 '' */
  querystring: string;
}

export type RouteMap = Record<string, Component>;

export interface InstallOptions {
  /** 访问根路径或空路径时规范化的默认模块路径，例如 /pianos */
  defaultPath?: string;
}

/** 全局路由状态（runes 响应式；页面用 $derived / 模板表达式读取即可自动更新） */
export const router = $state<RouterState>({ location: '/', querystring: '' });

let installed = false;

/** 路径归一化：去掉结尾斜杠、补齐前导斜杠，'' 与 '/' 归一为 '/' */
export function normalizePath(input: string): string {
  const withoutQuery = (input || '/').split('?')[0] ?? '/';
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const trimmed = withLeadingSlash.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

/** 读取当前地址栏并写入响应式状态 */
function syncFromLocation(): void {
  router.location = normalizePath(window.location.pathname);
  router.querystring = window.location.search;
}

/** 把地址栏切到目标地址（pushState / replaceState）并同步路由状态 */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const url = new URL(to, window.location.origin);
  const target = normalizePath(url.pathname) + url.search + url.hash;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (target !== current) {
    if (options.replace === true) {
      window.history.replaceState(null, '', target);
    } else {
      window.history.pushState(null, '', target);
    }
  }
  syncFromLocation();
  if (options.replace !== true) window.scrollTo({ top: 0 });
}

/** 编程式跳转（新增历史记录） */
export function push(to: string): void {
  navigate(to);
}

/** 编程式跳转（替换当前历史记录，用于兜底重定向） */
export function replace(to: string): void {
  navigate(to, { replace: true });
}

/** 只拦截「普通左键点击」：组合键 / 中键 / 右键交给浏览器默认行为 */
function isPlainLeftClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function onDocumentClick(event: MouseEvent): void {
  if (event.defaultPrevented || !isPlainLeftClick(event)) return;
  const origin = event.target as Element | null;
  const anchor = origin?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return;
  if (anchor.target && anchor.target !== '_self') return;
  if (anchor.hasAttribute('download') || anchor.dataset.native !== undefined) return;
  const url = new URL(anchor.href, window.location.origin);
  if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return;
  event.preventDefault();
  navigate(`${url.pathname}${url.search}`);
}

/** 旧版 hash 深链（/#/tunings）归一为真实路径，避免升级后老书签失效 */
function migrateLegacyHash(): void {
  const { hash } = window.location;
  if (hash.startsWith('#/')) {
    window.history.replaceState(null, '', normalizePath(hash.slice(1)));
  }
}

/** 安装路由：首屏按 location.pathname 匹配 + 根路径规范化 + 点击委托 + 前进后退监听 */
export function installRouter(options: InstallOptions = {}): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  migrateLegacyHash();

  const defaultPath = normalizePath(options.defaultPath ?? '/');
  if (defaultPath !== '/' && normalizePath(window.location.pathname) === '/') {
    window.history.replaceState(null, '', `${defaultPath}${window.location.search}`);
  }

  syncFromLocation();
  window.addEventListener('popstate', syncFromLocation);
  document.addEventListener('click', onDocumentClick);
}

/** 按当前路径解析要渲染的模块；未匹配时回落到 '*' 兜底页（保持原地址不变） */
export function resolveRoute(path: string, routes: RouteMap): Component {
  const normalized = normalizePath(path);
  const exact = routes[normalized];
  if (exact) return exact;

  // 支持子路径（如 /tunings/xxx）沿用所属模块
  const prefixed = Object.keys(routes).find(
    (key) => key !== '*' && key !== '/' && normalized.startsWith(`${key}/`)
  );
  if (prefixed) return routes[prefixed] as Component;

  const fallback = routes['*'] ?? routes['/'];
  if (fallback) return fallback;
  throw new Error(`路由表缺少兜底页（'*'），无法渲染 ${normalized}`);
}
