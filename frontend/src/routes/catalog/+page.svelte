<script lang="ts">
  /**
   * /catalog 印谱汇总与排序
   * 收录状态切换、排序重编号、本地结构版本查看与 JSON 导入导出，并生成印谱清单。
   * 消费 Catalog 及全部模型；复用 <StatBadge>、<EmptyPanel>、<GradeTag>。
   */
  import EmptyPanel from '$lib/components/common/EmptyPanel.svelte';
  import GradeTag from '$lib/components/common/GradeTag.svelte';
  import StatBadge from '$lib/components/common/StatBadge.svelte';
  import { useIdbTable } from '$lib/hooks/useIdbTable';
  import { designs, loadDesigns } from '$lib/stores/designStore';
  import { carves, loadCarves } from '$lib/stores/carveStore';
  import { impressions, loadImpressions, bestImpressionOf } from '$lib/stores/impressionStore';
  import { loadStones, stones } from '$lib/stores/stoneStore';
  import {
    INCLUDED_COLOR,
    INCLUDED_OPTIONS,
    createEmptyCatalogDraft,
    type Catalog,
    type IncludedStatus,
  } from '$lib/types/catalog';
  import {
    DB_NAME,
    DB_VERSION,
    exportSnapshot,
    importSnapshot,
    readLastBackupAt,
    resetDatabase,
    writeLastBackupAt,
  } from '$lib/utils/db';
  import {
    buildCatalogText,
    copyText,
    exportCatalogText,
    exportImpressionCsv,
    exportSnapshotJson,
    validateSnapshot,
  } from '$lib/utils/export';
  import type { SealCarveSnapshot } from '$lib/utils/db';

  // 印谱条目没有独立 store：本页通过 useIdbTable 的 liveQuery 订阅并完成全部读写
  const catalogTable = useIdbTable<Catalog>((database) => database.catalogs, { sortByUpdatedAt: false });
  const catalogRows = catalogTable.rows;

  let fileInput = $state<HTMLInputElement | null>(null);
  let lastBackupAt = $state<string | null>(readLastBackupAt());
  let toast = $state('');
  let pendingDelete = $state<Catalog | null>(null);
  let dialogOpen = $state(false);
  let newStoneId = $state('');
  let newDesignId = $state('');
  let newNote = $state('');

  const ordered = $derived([...$catalogRows].sort((a, b) => a.orderNo - b.orderNo));

  const context = $derived({
    stones: $stones,
    designs: $designs,
    carves: $carves,
    impressions: $impressions,
    catalogs: ordered,
  });

  const catalogText = $derived(buildCatalogText(context));

  const stat = $derived({
    total: ordered.length,
    included: ordered.filter((item) => item.included === 'included').length,
    pending: ordered.filter((item) => item.included === 'pending').length,
    excluded: ordered.filter((item) => item.included === 'excluded').length,
  });

  const unlistedDesigns = $derived(
    $designs.filter((design) => !ordered.some((item) => item.designId === design.id)),
  );
  const designsOfNewStone = $derived(unlistedDesigns.filter((design) => design.stoneId === newStoneId));

  $effect(() => {
    if (newStoneId.length === 0 && $stones.length > 0) newStoneId = $stones[0]?.id ?? '';
  });

  $effect(() => {
    const first = designsOfNewStone[0];
    if (first && !designsOfNewStone.some((design) => design.id === newDesignId)) newDesignId = first.id;
  });

  function designText(designId: string): string {
    const design = $designs.find((item) => item.id === designId);
    return design ? `${design.sealText}（${design.annotation || '无释文'}）` : '（印稿已删除）';
  }

  function stoneText(stoneId: string): string {
    return $stones.find((stone) => stone.id === stoneId)?.name ?? '（印石已删除）';
  }

  function showToast(text: string): void {
    toast = text;
    setTimeout(() => (toast = ''), 2600);
  }

  async function move(entry: Catalog, delta: number): Promise<void> {
    const list = ordered;
    const index = list.findIndex((item) => item.id === entry.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return;
    const reordered = [...list];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved as Catalog);
    const now = Date.now();
    await catalogTable.bulkPut(reordered.map((item, position) => ({ ...item, orderNo: position + 1, updatedAt: now })));
    showToast('排序已更新并重编号');
  }

  async function setIncluded(entry: Catalog, included: IncludedStatus): Promise<void> {
    await catalogTable.update(entry.id, { included });
  }

  async function saveNote(entry: Catalog, note: string): Promise<void> {
    await catalogTable.update(entry.id, { note });
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    await catalogTable.remove(pendingDelete.id);
    const rest = ordered.filter((item) => item.id !== pendingDelete?.id);
    const now = Date.now();
    if (rest.length > 0) {
      await catalogTable.bulkPut(rest.map((item, index) => ({ ...item, orderNo: index + 1, updatedAt: now })));
    }
    pendingDelete = null;
    showToast('已删除并重编号');
  }

  function openCreate(): void {
    if (unlistedDesigns.length === 0) {
      showToast('所有印稿都已进入印谱');
      return;
    }
    newStoneId = unlistedDesigns[0]?.stoneId ?? $stones[0]?.id ?? '';
    newDesignId = unlistedDesigns[0]?.id ?? '';
    newNote = '';
    dialogOpen = true;
  }

  async function submitNew(): Promise<void> {
    const design = $designs.find((item) => item.id === newDesignId);
    if (!design) return;
    const draft = createEmptyCatalogDraft(design.stoneId, design.id, ordered.length + 1);
    await catalogTable.create({ ...draft, note: newNote }, 'cata');
    dialogOpen = false;
    showToast(`已加入印谱：${design.sealText}`);
  }

  async function handleExport(): Promise<void> {
    const snapshot = await exportSnapshot();
    const filename = exportSnapshotJson(snapshot);
    const stamp = new Date().toISOString();
    writeLastBackupAt(stamp);
    lastBackupAt = stamp;
    showToast(`已导出 ${filename}（结构版本 v${snapshot.schemaVersion}）`);
  }

  async function handleImport(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      showToast('JSON 解析失败，请确认文件格式');
      return;
    }
    const invalid = validateSnapshot(parsed);
    if (invalid) {
      showToast(invalid);
      return;
    }
    if (!window.confirm('导入会清空当前浏览器中的全部档案，再写入备份内容，操作不可撤销。是否继续？')) return;
    await importSnapshot(parsed as SealCarveSnapshot);
    await Promise.all([loadStones(), loadDesigns(), loadCarves(), loadImpressions(), catalogTable.refresh()]);
    showToast('导入完成，数据已覆盖');
  }

  async function handleReset(): Promise<void> {
    if (!window.confirm('会删除当前浏览器中的全部档案并恢复演示数据，不可撤销。是否继续？')) return;
    await resetDatabase();
    await Promise.all([loadStones(), loadDesigns(), loadCarves(), loadImpressions(), catalogTable.refresh()]);
    showToast('已清空并重新载入演示数据');
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="text-xl tracking-wide text-ink">印谱汇总与数据导出</h2>
      <p class="mt-1 text-sm text-ink-soft">
        本地库 {DB_NAME} · 结构版本 v{DB_VERSION}
        {lastBackupAt ? `· 最近导出 ${new Date(lastBackupAt).toLocaleString('zh-CN')}` : '· 尚未导出过备份'}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="gb-btn" onclick={() => void handleExport()}>导出 JSON</button>
      <button class="gb-btn" onclick={() => fileInput?.click()}>导入 JSON</button>
      <button class="gb-btn-danger" onclick={() => void handleReset()}>清空重播种</button>
      <button class="gb-btn-primary" onclick={openCreate}>加入印谱</button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        class="hidden"
        onchange={(event) => void handleImport(event)}
      />
    </div>
  </div>

  {#if toast}
    <div class="rounded-xl border border-jade/40 bg-jade/10 px-4 py-2 text-sm text-jade">{toast}</div>
  {/if}

  <div class="flex flex-wrap gap-3">
    <StatBadge label="谱录条目" value={stat.total} suffix="方" tone="seal" />
    <StatBadge label="已收录" value={stat.included} suffix="方" tone="jade" />
    <StatBadge label="待收录" value={stat.pending} suffix="方" tone="amber" />
    <StatBadge label="不收录" value={stat.excluded} suffix="方" tone="ink" />
    <StatBadge label="钤印总数" value={$impressions.length} suffix="次" />
  </div>

  {#if ordered.length === 0}
    <EmptyPanel
      title="印谱还没有条目"
      description="把已完成的印稿加入印谱，调整排序与收录状态，即可导出印谱清单与 JSON 备份。"
      actionText="加入印谱"
      onAction={openCreate}
    />
  {:else}
    <div class="gb-panel overflow-x-auto">
      <table class="gb-table">
        <thead>
          <tr>
            <th class="w-20">排序</th>
            <th>印文 / 释文</th>
            <th class="w-40">印石</th>
            <th class="w-32">状态</th>
            <th class="w-28">最佳评级</th>
            <th class="w-56">备注</th>
            <th class="w-52">操作</th>
          </tr>
        </thead>
        <tbody>
          {#each ordered as entry, index (entry.id)}
            {@const best = bestImpressionOf(entry.designId)}
            <tr>
              <td class="whitespace-nowrap">
                <div class="flex items-center gap-1">
                  <span class="tabular-nums">{entry.orderNo}</span>
                  <button class="gb-btn px-2 py-0.5" disabled={index === 0} onclick={() => void move(entry, -1)}>↑</button>
                  <button
                    class="gb-btn px-2 py-0.5"
                    disabled={index === ordered.length - 1}
                    onclick={() => void move(entry, 1)}
                  >
                    ↓
                  </button>
                </div>
              </td>
              <td>{designText(entry.designId)}</td>
              <td>{stoneText(entry.stoneId)}</td>
              <td>
                <select
                  class="gb-input py-1"
                  style="color:{INCLUDED_COLOR[entry.included]}"
                  value={entry.included}
                  onchange={(event) =>
                    void setIncluded(entry, (event.currentTarget as HTMLSelectElement).value as IncludedStatus)}
                >
                  {#each INCLUDED_OPTIONS as item (item.value)}
                    <option value={item.value}>{item.label}</option>
                  {/each}
                </select>
              </td>
              <td>
                {#if best}
                  <GradeTag grade={best.grade} size="small" />
                {:else}
                  <span class="text-xs text-ink-soft">未钤印</span>
                {/if}
              </td>
              <td>
                <input
                  class="gb-input py-1"
                  value={entry.note}
                  placeholder="备注"
                  onchange={(event) => void saveNote(entry, (event.currentTarget as HTMLInputElement).value)}
                />
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <button
                    class="gb-btn px-2 py-1"
                    onclick={() => void setIncluded(entry, entry.included === 'included' ? 'pending' : 'included')}
                  >
                    {entry.included === 'included' ? '取消收录' : '标记收录'}
                  </button>
                  <button class="gb-btn-danger px-2 py-1" onclick={() => (pendingDelete = entry)}>删除</button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="grid gap-4 xl:grid-cols-2">
    <section class="gb-panel">
      <header class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-base text-ink">印谱清单</h3>
        <div class="flex flex-wrap gap-2">
          <button class="gb-btn" onclick={() => showToast(exportCatalogText(context))}>导出清单</button>
          <button
            class="gb-btn"
            onclick={async () => {
              const ok = await copyText(catalogText);
              showToast(ok ? '印谱清单已复制到剪贴板' : '浏览器未授权剪贴板');
            }}
          >
            复制
          </button>
        </div>
      </header>
      <pre class="max-h-[360px] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-soft">{catalogText}</pre>
    </section>

    <section class="gb-panel space-y-3">
      <h3 class="text-base text-ink">整库导出</h3>
      <p class="text-sm text-ink-soft">
        导出文件包含 5 张业务表全量数据与结构版本号（v{DB_VERSION}），可在其他设备通过「导入 JSON」还原。
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="gb-btn" onclick={() => void handleExport()}>JSON 备份</button>
        <button class="gb-btn" onclick={() => showToast(exportImpressionCsv(context))}>钤印台账 CSV</button>
      </div>
      <div class="rounded-xl border border-line bg-black/[0.02] px-3 py-2 text-xs text-ink-soft">
        无状态容器：服务端不保存任何数据；清理浏览器站点数据会丢失档案，请定期导出备份。
      </div>
      <dl class="grid grid-cols-2 gap-2 text-xs text-ink-soft">
        <div>印石 {$stones.length} 方</div>
        <div>印稿 {$designs.length} 稿</div>
        <div>工序 {$carves.length} 道</div>
        <div>钤印 {$impressions.length} 次</div>
      </dl>
    </section>
  </div>

  <p class="text-xs text-ink-soft">
    排序调整后自动重编号（1…n）；收录状态分为「待收录 / 已收录 / 不收录」，印谱清单按排序号展开并附最佳钤印评级。
  </p>
</div>

{#if dialogOpen}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
    <div class="w-full max-w-lg rounded-xl border border-line bg-paper-light p-5 shadow-xl">
      <h3 class="mb-3 text-lg text-ink">加入印谱</h3>
      <div class="space-y-3">
        <label class="block">
          <span class="gb-label">印石（仅显示尚有未收录印稿的印石）</span>
          <select class="gb-input" bind:value={newStoneId}>
            {#each $stones as stone (stone.id)}
              <option value={stone.id}>{stone.name}</option>
            {/each}
          </select>
        </label>
        <label class="block">
          <span class="gb-label">印稿</span>
          <select class="gb-input" bind:value={newDesignId}>
            {#each designsOfNewStone as design (design.id)}
              <option value={design.id}>{design.sealText}（{design.annotation || '无释文'}）</option>
            {/each}
          </select>
        </label>
        <label class="block">
          <span class="gb-label">备注</span>
          <input class="gb-input" bind:value={newNote} placeholder="如：印谱首方" />
        </label>
        <p class="text-xs text-ink-soft">新条目将追加到第 {ordered.length + 1} 位，默认状态为「待收录」。</p>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button class="gb-btn" onclick={() => (dialogOpen = false)}>取消</button>
        <button class="gb-btn-primary" onclick={() => void submitNew()}>加入</button>
      </div>
    </div>
  </div>
{/if}

{#if pendingDelete}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
    <div class="w-full max-w-md rounded-xl border border-line bg-paper-light p-5 shadow-xl">
      <h3 class="text-lg text-ink">删除谱录条目</h3>
      <p class="mt-2 text-sm text-ink-soft">
        将把「{designText(pendingDelete.designId)}」移出印谱，其余条目自动重编号；印稿与钤印记录不受影响。
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button class="gb-btn" onclick={() => (pendingDelete = null)}>取消</button>
        <button class="gb-btn-primary" onclick={() => void confirmDelete()}>确认删除</button>
      </div>
    </div>
  </div>
{/if}
