/**
 * 路由表（history 模式真实路径，与提示词逐字一致）
 * /stones、/designs、/carve、/impressions、/catalog
 * 直接访问真实路径即可命中；刷新由 nginx / vite 的 SPA fallback 回退 index.html。
 */
import type { Component } from 'svelte';
import { ROUTES } from '$lib/router';
import StonesPage from '../../routes/stones/+page.svelte';
import DesignsPage from '../../routes/designs/+page.svelte';
import CarvePage from '../../routes/carve/+page.svelte';
import ImpressionsPage from '../../routes/impressions/+page.svelte';
import CatalogPage from '../../routes/catalog/+page.svelte';
import NotFoundPage from '../../routes/NotFound.svelte';

export const routes: Record<string, Component> = {
  '/': StonesPage,
  [ROUTES.stones]: StonesPage,
  [ROUTES.designs]: DesignsPage,
  [ROUTES.carve]: CarvePage,
  [ROUTES.impressions]: ImpressionsPage,
  [ROUTES.catalog]: CatalogPage,
  '*': NotFoundPage
};

export default routes;
