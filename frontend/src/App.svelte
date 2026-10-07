<script lang="ts">
  /**
   * 应用外壳：品牌头 + 模块导航 + 页脚统计
   * 首屏初始化 IndexedDB（首次自动播种演示数据）并载入各 store。
   */
  import { onMount } from 'svelte';
  import { activeNav, NAV_ITEMS, router } from '$lib/router';
  import RouteView from '$lib/router/RouteView.svelte';
  import { initDatabase } from '$lib/utils/db';
  import { loadStones, stones } from '$lib/stores/stoneStore';
  import { designs, loadDesigns } from '$lib/stores/designStore';
  import { carves, loadCarves } from '$lib/stores/carveStore';
  import { impressions, loadImpressions } from '$lib/stores/impressionStore';
  import { useIdbTable } from '$lib/hooks/useIdbTable';
  import type { Catalog } from '$lib/types/catalog';

  // 印谱条目没有独立 store：App 与 /catalog 页通过 useIdbTable 的 liveQuery 订阅消费
  const catalogTable = useIdbTable<Catalog>((database) => database.catalogs, { sortByUpdatedAt: false });
  const catalogRows = catalogTable.rows;

  let ready = $state(false);
  let errorText = $state('');

  const current = $derived(activeNav(router.location));

  onMount(async () => {
    try {
      await initDatabase();
      await Promise.all([loadStones(), loadDesigns(), loadCarves(), loadImpressions()]);
    } catch (error) {
      errorText = error instanceof Error ? error.message : '本地数据库初始化失败';
    } finally {
      ready = true;
    }
  });
</script>

<div class="relative z-10 flex min-h-screen flex-col">
  <header class="border-b border-line bg-paper-light/95 backdrop-blur">
    <div class="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-6 py-3">
      <div class="flex items-center gap-3">
        <span class="grid h-10 w-10 place-items-center rounded-xl bg-seal text-lg font-bold text-paper-light">印</span>
        <div>
          <h1 class="text-lg tracking-widest text-ink">篆刻印章与钤印记录台</h1>
          <p class="text-xs text-ink-soft">gbsealcarve · 印石 → 印稿 → 刻制 → 钤印 → 印谱</p>
        </div>
      </div>

      <nav class="flex flex-wrap gap-2">
        {#each NAV_ITEMS as item (item.path)}
          <a
            href={item.path}
            aria-current={current === item.path ? 'page' : undefined}
            class="rounded-full border px-4 py-2 text-sm transition {current === item.path
              ? 'border-seal bg-seal text-paper-light'
              : 'border-line text-ink hover:bg-black/5'}"
            title={item.desc}
          >
            {item.label}
          </a>
        {/each}
      </nav>
    </div>
  </header>

  <main class="mx-auto w-full max-w-[1360px] flex-1 px-6 py-5">
    {#if errorText}
      <div class="mb-4 rounded-xl border border-seal/40 bg-seal/10 px-4 py-3 text-sm text-seal">
        本地数据库初始化失败：{errorText}
      </div>
    {/if}
    {#if !ready}
      <div class="rounded-xl border border-line bg-paper-light px-4 py-6 text-sm text-ink-soft">
        正在读取本地档案…
      </div>
    {:else}
      <RouteView />
    {/if}
  </main>

  <footer class="flex flex-wrap items-center justify-between gap-2 px-6 pb-6 pt-3 text-xs text-ink-soft">
    <span>数据仅保存在本机浏览器（IndexedDB / localStorage），不上传任何服务器。</span>
    <span>
      印石 {$stones.length} 方 · 印稿 {$designs.length} 稿 · 工序 {$carves.length} 道 · 钤印
      {$impressions.length} 次 · 谱录 {$catalogRows.length} 条
    </span>
  </footer>
</div>
