<script lang="ts">
  /**
   * /carve 刻制工序看板
   * 按印稿列出刀法步骤、拖拽/上下移排序、逐条标记完成；全部完成即回写印石为已刻。
   * 消费 Carve、Design；复用 <StatBadge>、<FilterBar>、<EmptyPanel>。
   */
  import { push, router } from '$lib/router';
  import EmptyPanel from '$lib/components/common/EmptyPanel.svelte';
  import FilterBar, {
    encodeQuery,
    firstValue,
    parseQuery,
    type FilterSelectConfig,
  } from '$lib/components/common/FilterBar.svelte';
  import StatBadge from '$lib/components/common/StatBadge.svelte';
  import { progressOfDesign, useCarveProgress } from '$lib/hooks/useCarveProgress';
  import {
    advanceCarve,
    batchUpdateCarves,
    carvesOfDesign,
    createCarve,
    generateStandardSequence,
    nextSeq,
    removeCarve,
    reorderCarves,
    updateCarve,
  } from '$lib/stores/carveStore';
  import { currentDesignId, designs, setCurrentDesign } from '$lib/stores/designStore';
  import { stones } from '$lib/stores/stoneStore';
  import {
    CARVE_STATE_COLOR,
    CARVE_STATE_LABEL,
    CARVE_STATE_OPTIONS,
    KNIFE_METHOD_COLOR,
    KNIFE_METHOD_LABEL,
    KNIFE_METHOD_OPTIONS,
    createEmptyCarveDraft,
    type Carve,
    type CarveDraft,
    type CarveState,
    type KnifeMethod,
  } from '$lib/types/carve';
  import { DESIGN_STYLE_LABEL } from '$lib/types/design';

  const { progressByDesign, totals } = useCarveProgress();
  const queryValues = $derived(parseQuery(router.querystring ?? ''));

  const activeDesignId = $derived($currentDesignId ?? $designs[0]?.id ?? '');
  const activeDesign = $derived($designs.find((design) => design.id === activeDesignId) ?? null);
  const stoneName = $derived(
    stones ? ($stones.find((stone) => stone.id === activeDesign?.stoneId)?.name ?? '—') : '—',
  );

  const steps = $derived(
    carvesOfDesign(activeDesignId).filter((carve) => {
      const keyword = firstValue(queryValues, 'kw').trim();
      const methods = (queryValues.knifeMethod ?? []) as KnifeMethod[];
      const states = (queryValues.state ?? []) as CarveState[];
      if (keyword.length > 0 && !`${carve.operator}${carve.minutes}`.includes(keyword)) return false;
      if (methods.length > 0 && !methods.includes(carve.knifeMethod)) return false;
      if (states.length > 0 && !states.includes(carve.state)) return false;
      return true;
    }),
  );

  const progress = $derived(progressOfDesign($progressByDesign, activeDesignId));

  function updateQuery(patch: Record<string, string | string[] | undefined>): void {
    const merged: Record<string, string[]> = { ...parseQuery(router.querystring ?? '') };
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete merged[key];
      else merged[key] = Array.isArray(value) ? value : [value];
    });
    const qs = encodeQuery(merged);
    void push(`/carve${qs.length > 0 ? `?${qs}` : ''}`);
  }

  const selects: FilterSelectConfig[] = [
    { key: 'knifeMethod', label: '刀法', options: KNIFE_METHOD_OPTIONS.map((item) => ({ label: item.label, value: item.value })) },
    { key: 'state', label: '状态', options: CARVE_STATE_OPTIONS.map((item) => ({ label: item.label, value: item.value })) },
  ];

  let dialogOpen = $state(false);
  let editing = $state<Carve | null>(null);
  let draft = $state<CarveDraft>(createEmptyCarveDraft('', 1));
  let pendingDelete = $state<Carve | null>(null);
  let selectedIds = $state<string[]>([]);
  let dragId = $state('');

  function openCreate(): void {
    if (!activeDesignId) return;
    editing = null;
    draft = createEmptyCarveDraft(activeDesignId, nextSeq(activeDesignId));
    dialogOpen = true;
  }

  function openEdit(carve: Carve): void {
    editing = carve;
    draft = {
      designId: carve.designId,
      seq: carve.seq,
      knifeMethod: carve.knifeMethod,
      minutes: carve.minutes,
      operator: carve.operator,
      state: carve.state,
    };
    dialogOpen = true;
  }

  async function submit(): Promise<void> {
    if (editing) {
      await updateCarve(editing.id, { ...draft });
      editing = null;
    } else {
      await createCarve({ ...draft });
    }
    dialogOpen = false;
    selectedIds = [];
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    await removeCarve(pendingDelete.id);
    pendingDelete = null;
  }

  async function generate(): Promise<void> {
    if (!activeDesignId) return;
    await generateStandardSequence(activeDesignId);
  }

  async function move(step: Carve, delta: number): Promise<void> {
    const list = carvesOfDesign(activeDesignId);
    const index = list.findIndex((carve) => carve.id === step.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return;
    const ids = list.map((carve) => carve.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved as string);
    await reorderCarves(activeDesignId, ids);
  }

  async function handleDrop(targetId: string): Promise<void> {
    if (!dragId || dragId === targetId) return;
    const ids = carvesOfDesign(activeDesignId).map((carve) => carve.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    dragId = '';
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved as string);
    await reorderCarves(activeDesignId, ids);
  }

  function toggleSelect(id: string): void {
    selectedIds = selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id];
  }

  async function batchDone(): Promise<void> {
    await batchUpdateCarves(selectedIds, { state: 'done' });
    selectedIds = [];
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="text-xl tracking-wide text-ink">刻制工序看板</h2>
      <p class="mt-1 text-sm text-ink-soft">按刀法排布刻制步骤，拖拽或上下移调整先后；全部完成自动回写印石为「已刻」。</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <select
        class="gb-input w-[260px]"
        value={activeDesignId}
        onchange={(event) => setCurrentDesign((event.currentTarget as HTMLSelectElement).value)}
      >
        {#each $designs as design (design.id)}
          <option value={design.id}>
            {design.sealText}{design.adopted ? '（采用稿）' : ''} · {DESIGN_STYLE_LABEL[design.style]}
          </option>
        {/each}
      </select>
      <button class="gb-btn" onclick={() => void generate()}>生成标准序列</button>
      <button class="gb-btn" disabled={selectedIds.length === 0} onclick={() => void batchDone()}>
        批量完成（{selectedIds.length}）
      </button>
      <button class="gb-btn-primary" onclick={openCreate}>新增工序</button>
    </div>
  </div>

  {#if activeDesign}
    <div class="gb-panel flex flex-wrap items-center gap-3 text-sm text-ink-soft">
      <span class="text-ink">印文：{activeDesign.sealText}</span>
      <span>印石：{stoneName}</span>
      <span>{DESIGN_STYLE_LABEL[activeDesign.style]}</span>
      <span>释文：{activeDesign.annotation || '未填写'}</span>
    </div>
  {/if}

  <div class="flex flex-wrap gap-3">
    <StatBadge label="本稿工序" value={progress.total} suffix="道" tone="seal" />
    <StatBadge label="完成率" value={`${progress.percent}%`} percent={progress.percent} tone="jade" />
    <StatBadge label="已完成" value={progress.done} suffix="道" tone="jade" />
    <StatBadge label="进行中" value={progress.doing} suffix="道" tone="amber" />
    <StatBadge label="剩余时长" value={progress.remainingMinutes} suffix="分钟" />
    <StatBadge label="全局完成率" value={`${$totals.percent}%`} percent={$totals.percent} tone="ink" />
  </div>

  <FilterBar
    keyword={firstValue(queryValues, 'kw')}
    placeholder="搜索执刀人 / 时长…"
    {selects}
    values={queryValues}
    onKeyword={(value) => updateQuery({ kw: value })}
    onSelect={(key, value) => updateQuery({ [key]: value })}
    onReset={() => updateQuery({ kw: undefined, knifeMethod: undefined, state: undefined })}
    hint={`共 ${steps.length} / ${progress.total} 道`}
  />

  {#if steps.length === 0}
    <EmptyPanel
      title={progress.total === 0 ? '该印稿还没有排工序' : '当前筛选条件下没有工序'}
      description={progress.total === 0
        ? '可一键生成标准刀法序列（冲刀 → 切刀 → 双刀 → 修整），也可手动逐条新增。'
        : '试着调整刀法或状态筛选条件。'}
      actionText="生成标准序列"
      secondaryText="重置筛选"
      onAction={() => void generate()}
      onSecondary={() => updateQuery({ kw: undefined, knifeMethod: undefined, state: undefined })}
    />
  {:else}
    <div class="space-y-2">
      {#each steps as step (step.id)}
        <div
          class="gb-panel flex flex-wrap items-center gap-3 {dragId === step.id ? 'opacity-50' : ''}"
          draggable="true"
          ondragstart={() => (dragId = step.id)}
          ondragover={(event) => event.preventDefault()}
          ondrop={() => void handleDrop(step.id)}
          role="listitem"
        >
          <span class="cursor-grab text-ink-soft" title="按住拖动可调整工序先后">⋮⋮</span>
          <input
            type="checkbox"
            checked={selectedIds.includes(step.id)}
            onchange={() => toggleSelect(step.id)}
            aria-label="选择工序"
          />
          <span class="gb-tag" style="color:#23282a;border-color:#23282a33">第 {step.seq} 道</span>
          <span class="gb-tag" style="color:{KNIFE_METHOD_COLOR[step.knifeMethod]};border-color:{KNIFE_METHOD_COLOR[step.knifeMethod]}66">
            {KNIFE_METHOD_LABEL[step.knifeMethod]}
          </span>
          <span class="gb-tag" style="color:{CARVE_STATE_COLOR[step.state]};border-color:{CARVE_STATE_COLOR[step.state]}66">
            {CARVE_STATE_LABEL[step.state]}
          </span>
          <span class="text-sm text-ink-soft">{step.minutes} 分钟 · {step.operator || '未填执刀人'}</span>

          <div class="ml-auto flex flex-wrap gap-1">
            <button class="gb-btn" onclick={() => void move(step, -1)} title="上移">↑</button>
            <button class="gb-btn" onclick={() => void move(step, 1)} title="下移">↓</button>
            <button class="gb-btn" onclick={() => void advanceCarve(step.id)}>推进状态</button>
            <button class="gb-btn" onclick={() => openEdit(step)}>编辑</button>
            <button class="gb-btn-danger" onclick={() => (pendingDelete = step)}>删除</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <p class="text-xs text-ink-soft">
    状态推进顺序：未开始 → 进行中 → 已完成；某印稿全部工序完成时，会把所属印石状态回写为「已刻」。
  </p>
</div>

{#if dialogOpen}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
    <div class="w-full max-w-lg rounded-xl border border-line bg-paper-light p-5 shadow-xl">
      <h3 class="mb-3 text-lg text-ink">{editing ? `编辑第 ${editing.seq} 道工序` : '新增刻制工序'}</h3>
      <div class="space-y-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="gb-label">工序序号</span>
            <input class="gb-input" type="number" min="1" bind:value={draft.seq} />
          </label>
          <label class="block">
            <span class="gb-label">刀法</span>
            <select class="gb-input" bind:value={draft.knifeMethod}>
              {#each KNIFE_METHOD_OPTIONS as item (item.value)}
                <option value={item.value}>{item.label}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="gb-label">时长（分钟）</span>
            <input class="gb-input" type="number" min="1" bind:value={draft.minutes} />
          </label>
          <label class="block">
            <span class="gb-label">执刀人</span>
            <input class="gb-input" bind:value={draft.operator} placeholder="如：顾墨" />
          </label>
        </div>
        <label class="block">
          <span class="gb-label">状态</span>
          <select class="gb-input" bind:value={draft.state}>
            {#each CARVE_STATE_OPTIONS as item (item.value)}
              <option value={item.value}>{item.label}</option>
            {/each}
          </select>
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
      <h3 class="text-lg text-ink">删除工序</h3>
      <p class="mt-2 text-sm text-ink-soft">删除第 {pendingDelete.seq} 道「{KNIFE_METHOD_LABEL[pendingDelete.knifeMethod]}」后，其余工序会自动重编号。</p>
      <div class="mt-5 flex justify-end gap-2">
        <button class="gb-btn" onclick={() => (pendingDelete = null)}>取消</button>
        <button class="gb-btn-primary" onclick={() => void confirmDelete()}>确认删除</button>
      </div>
    </div>
  </div>
{/if}
