<script lang="ts">
  /**
   * /designs 印稿设计与释文编辑
   * 朱文白文、边框式样与章法备注录入并标记采用稿（同石采用稿唯一）。
   * 消费 Design、Stone；复用 <FilterBar>、<EmptyPanel>、<GradeTag>、<StatBadge>。
   */
  import { push, router } from '$lib/router';
  import EmptyPanel from '$lib/components/common/EmptyPanel.svelte';
  import FilterBar, {
    encodeQuery,
    firstValue,
    parseQuery,
    type FilterSelectConfig,
  } from '$lib/components/common/FilterBar.svelte';
  import GradeTag from '$lib/components/common/GradeTag.svelte';
  import StatBadge from '$lib/components/common/StatBadge.svelte';
  import { useCarveProgress, progressOfDesign } from '$lib/hooks/useCarveProgress';
  import {
    adoptDesign,
    createDesign,
    currentDesignId,
    designFilters,
    designs,
    designsOfStone,
    filteredDesigns,
    removeDesign,
    resetDesignFilters,
    setAdoptedOnly,
    setBorderStyles,
    setCurrentDesign,
    setDesignKeyword,
    setDesignStyles,
    updateDesign,
  } from '$lib/stores/designStore';
  import { currentStoneId, setCurrentStone, stones } from '$lib/stores/stoneStore';
  import { impressions, bestImpressionOf } from '$lib/stores/impressionStore';
  import {
    BORDER_STYLE_LABEL,
    BORDER_STYLE_OPTIONS,
    DESIGN_STYLE_LABEL,
    DESIGN_STYLE_OPTIONS,
    createEmptyDesignDraft,
    type BorderStyle,
    type Design,
    type DesignDraft,
    type DesignStyle,
  } from '$lib/types/design';
  import { STONE_TYPE_LABEL } from '$lib/types/stone';

  const { progressByDesign } = useCarveProgress();
  const queryValues = $derived(parseQuery(router.querystring ?? ''));

  $effect(() => {
    setDesignKeyword(firstValue(queryValues, 'kw'));
    setDesignStyles((queryValues.style ?? []) as DesignStyle[]);
    setBorderStyles((queryValues.borderStyle ?? []) as BorderStyle[]);
    setAdoptedOnly(firstValue(queryValues, 'adopted') === '1');
  });

  function updateQuery(patch: Record<string, string | string[] | undefined>): void {
    const merged: Record<string, string[]> = { ...parseQuery(router.querystring ?? '') };
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete merged[key];
      else merged[key] = Array.isArray(value) ? value : [value];
    });
    const qs = encodeQuery(merged);
    void push(`/designs${qs.length > 0 ? `?${qs}` : ''}`);
  }

  const selects: FilterSelectConfig[] = [
    { key: 'style', label: '朱白文', options: DESIGN_STYLE_OPTIONS.map((item) => ({ label: item.label, value: item.value })) },
    { key: 'borderStyle', label: '边框', options: BORDER_STYLE_OPTIONS.map((item) => ({ label: item.label, value: item.value })) },
  ];

  const stoneOptions = $derived($stones.map((stone) => ({ id: stone.id, name: stone.name })));
  const activeStoneId = $derived($currentStoneId ?? $stones[0]?.id ?? '');
  const list = $derived(
    $filteredDesigns.filter((design) => design.stoneId === activeStoneId || $currentStoneId === null),
  );

  const totals = $derived({
    designs: $designs.length,
    adopted: $designs.filter((design) => design.adopted).length,
    zhu: $designs.filter((design) => design.style === 'zhu').length,
    bai: $designs.filter((design) => design.style === 'bai').length,
    stamped: $impressions.length,
  });

  let dialogOpen = $state(false);
  let editing = $state<Design | null>(null);
  let draft = $state<DesignDraft>(createEmptyDesignDraft(''));
  let pendingDelete = $state<Design | null>(null);

  function openCreate(): void {
    const stoneId = activeStoneId;
    if (!stoneId) return;
    editing = null;
    draft = createEmptyDesignDraft(stoneId);
    dialogOpen = true;
  }

  function openEdit(design: Design): void {
    editing = design;
    draft = {
      stoneId: design.stoneId,
      sealText: design.sealText,
      annotation: design.annotation,
      style: design.style,
      borderStyle: design.borderStyle,
      layoutNote: design.layoutNote,
      adopted: design.adopted,
    };
    dialogOpen = true;
  }

  async function submit(): Promise<void> {
    if (draft.sealText.trim().length === 0) return;
    if (editing) {
      await updateDesign(editing.id, { ...draft });
      editing = null;
    } else {
      await createDesign({ ...draft });
    }
    dialogOpen = false;
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    await removeDesign(pendingDelete.id);
    pendingDelete = null;
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="text-xl tracking-wide text-ink">印稿设计与释文</h2>
      <p class="mt-1 text-sm text-ink-soft">同一印石可存多稿并标记采用稿；采用后可带出到刻制与钤印登记。</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <select
        class="gb-input w-[220px]"
        value={activeStoneId}
        onchange={(event) => {
          const value = (event.currentTarget as HTMLSelectElement).value;
          setCurrentStone(value);
          const first = designsOfStone(value)[0];
          if (first) setCurrentDesign(first.id);
        }}
      >
        {#each stoneOptions as stone (stone.id)}
          <option value={stone.id}>{stone.name}</option>
        {/each}
      </select>
      <button class="gb-btn" onclick={() => void push('/carve')}>刻制看板</button>
      <button class="gb-btn-primary" onclick={openCreate}>新建印稿</button>
    </div>
  </div>

  <div class="flex flex-wrap gap-3">
    <StatBadge label="印稿总数" value={totals.designs} suffix="稿" tone="seal" />
    <StatBadge label="采用稿" value={totals.adopted} suffix="稿" tone="jade" />
    <StatBadge label="朱文" value={totals.zhu} suffix="稿" tone="amber" />
    <StatBadge label="白文" value={totals.bai} suffix="稿" tone="ink" />
    <StatBadge label="钤印次数" value={totals.stamped} suffix="次" />
  </div>

  <FilterBar
    keyword={$designFilters.keyword}
    placeholder="搜索印文 / 释文 / 章法…"
    {selects}
    values={queryValues}
    onKeyword={(value) => updateQuery({ kw: value })}
    onSelect={(key, value) => updateQuery({ [key]: value })}
    onReset={() => {
      resetDesignFilters();
      updateQuery({ kw: undefined, style: undefined, borderStyle: undefined, adopted: undefined });
    }}
    hint={`共 ${list.length} / ${$designs.length} 稿`}
  />

  <div class="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
    <button
      class="rounded-full border px-3 py-1 {$designFilters.adoptedOnly ? 'border-seal bg-seal/10 text-seal' : 'border-line'}"
      onclick={() => updateQuery({ adopted: $designFilters.adoptedOnly ? undefined : '1' })}
    >
      仅看采用稿
    </button>
    <span>当前印石：{stoneOptions.find((stone) => stone.id === activeStoneId)?.name ?? '未选择'}</span>
  </div>

  {#if list.length === 0}
    <EmptyPanel
      title={$designs.length === 0 ? '还没有设计任何印稿' : '当前筛选条件下没有印稿'}
      description={$designs.length === 0
        ? '为印石设计第一稿：填写印文、释文、朱白文与边框式样，并标记采用稿。'
        : '试着放宽朱白文或边框条件，或重置筛选。'}
      actionText="新建印稿"
      secondaryText="重置筛选"
      onAction={openCreate}
      onSecondary={() => {
        resetDesignFilters();
        updateQuery({ kw: undefined, style: undefined, borderStyle: undefined, adopted: undefined });
      }}
    />
  {:else}
    <div class="grid gap-4 md:grid-cols-2">
      {#each list as design (design.id)}
        {@const progress = progressOfDesign($progressByDesign, design.id)}
        {@const best = bestImpressionOf(design.id)}
        <article class="gb-panel {$currentDesignId === design.id ? 'ring-2 ring-seal/40' : ''}">
          <header class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="gb-tag" style="color:#9c2b1f;border-color:#9c2b1f66">{DESIGN_STYLE_LABEL[design.style]}</span>
              <span class="text-lg font-semibold tracking-[0.2em] text-ink">{design.sealText}</span>
              {#if design.adopted}<span class="gb-tag" style="color:#3f6b57;border-color:#3f6b5766">采用稿</span>{/if}
            </div>
            <span class="text-xs text-ink-soft">{BORDER_STYLE_LABEL[design.borderStyle]}</span>
          </header>

          <div class="mt-3 gb-seal-preview border-seal/50 text-seal" style="border-style:{design.borderStyle === 'none'
            ? 'none'
            : design.borderStyle === 'double'
              ? 'double'
              : 'solid'}">
            {design.sealText || '印文待定'}
          </div>

          <dl class="mt-3 space-y-1 text-sm text-ink-soft">
            <div>释文：{design.annotation || '未填写'}</div>
            <div>章法：{design.layoutNote || '未填写'}</div>
            <div>
              工序 {progress.done}/{progress.total}（{progress.percent}%）· 剩余 {progress.remainingMinutes} 分钟 · 钤印
              {progress.impressionCount} 次
            </div>
          </dl>

          {#if best}
            <div class="mt-2"><GradeTag grade={best.grade} size="small" note={`最佳 ${best.stampedAt}`} /></div>
          {/if}

          <div class="mt-3 flex flex-wrap gap-2">
            {#if $currentDesignId !== design.id}
              <button class="gb-btn" onclick={() => setCurrentDesign(design.id)}>设为当前</button>
            {/if}
            {#if !design.adopted}
              <button class="gb-btn" onclick={() => void adoptDesign(design.id)}>设为采用稿</button>
            {/if}
            <button class="gb-btn" onclick={() => (setCurrentDesign(design.id), void push('/carve'))}>排工序</button>
            <button class="gb-btn" onclick={() => (setCurrentDesign(design.id), void push('/impressions'))}>去钤印</button>
            <button class="gb-btn" onclick={() => openEdit(design)}>编辑</button>
            <button class="gb-btn-danger" onclick={() => (pendingDelete = design)}>删除</button>
          </div>
        </article>
      {/each}
    </div>
  {/if}

  <p class="text-xs text-ink-soft">
    采用稿唯一：把某一稿设为采用稿时，同印石的其它稿会自动取消采用标记；采用稿与工序完成后才计入「已刻方数」。
  </p>
</div>

{#if dialogOpen}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
    <div class="w-full max-w-lg rounded-xl border border-line bg-paper-light p-5 shadow-xl">
      <h3 class="mb-3 text-lg text-ink">{editing ? `编辑印稿「${editing.sealText}」` : '新建印稿'}</h3>
      <div class="space-y-3">
        <label class="block">
          <span class="gb-label">所属印石</span>
          <select class="gb-input" bind:value={draft.stoneId}>
            {#each $stones as stone (stone.id)}
              <option value={stone.id}>{STONE_TYPE_LABEL[stone.stoneType]} · {stone.name}</option>
            {/each}
          </select>
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="gb-label">印文</span>
            <input class="gb-input" bind:value={draft.sealText} placeholder="如：澄怀观道" />
          </label>
          <label class="block">
            <span class="gb-label">朱文 / 白文</span>
            <select class="gb-input" bind:value={draft.style}>
              {#each DESIGN_STYLE_OPTIONS as item (item.value)}
                <option value={item.value}>{item.label}</option>
              {/each}
            </select>
          </label>
        </div>
        <label class="block">
          <span class="gb-label">释文</span>
          <input class="gb-input" bind:value={draft.annotation} placeholder="如：宗炳《画山水序》语，四字朱文" />
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="gb-label">边框式样</span>
            <select class="gb-input" bind:value={draft.borderStyle}>
              {#each BORDER_STYLE_OPTIONS as item (item.value)}
                <option value={item.value}>{item.label}</option>
              {/each}
            </select>
          </label>
          <label class="flex items-center gap-2 pt-5">
            <input type="checkbox" bind:checked={draft.adopted} />
            <span class="text-sm text-ink">标记为采用稿</span>
          </label>
        </div>
        <label class="block">
          <span class="gb-label">章法备注</span>
          <textarea class="gb-input" rows="2" bind:value={draft.layoutNote} placeholder="如：四字均分，「观」字略收以让边"></textarea>
        </label>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button class="gb-btn" onclick={() => (dialogOpen = false)}>取消</button>
        <button class="gb-btn-primary" onclick={() => void submit()}>保存</button>
      </div>
    </div>
  </div>
{/if}

{#if pendingDelete}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
    <div class="w-full max-w-md rounded-xl border border-line bg-paper-light p-5 shadow-xl">
      <h3 class="text-lg text-ink">删除印稿</h3>
      <p class="mt-2 text-sm text-ink-soft">
        将同时删除「{pendingDelete.sealText}」的刻制工序、钤印记录与谱录条目，不可恢复。
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button class="gb-btn" onclick={() => (pendingDelete = null)}>取消</button>
        <button class="gb-btn-primary" onclick={() => void confirmDelete()}>确认删除</button>
      </div>
    </div>
  </div>
{/if}
