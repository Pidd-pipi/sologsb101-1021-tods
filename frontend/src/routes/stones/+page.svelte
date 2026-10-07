<script lang="ts">
  /**
   * /stones 印石台账
   * 新建印石、按石种与钮式筛选（筛选条件同步 URL query），显示已刻方数与闲置天数。
   * 消费 Stone、Design；复用 <FilterBar>、<EmptyPanel>、<StatBadge>、<GradeTag>。
   */
  import { push, router } from '$lib/router';
  import EmptyPanel from '$lib/components/common/EmptyPanel.svelte';
  import FilterBar, {
    firstValue,
    encodeQuery,
    parseQuery,
    type FilterSelectConfig,
  } from '$lib/components/common/FilterBar.svelte';
  import GradeTag from '$lib/components/common/GradeTag.svelte';
  import StatBadge from '$lib/components/common/StatBadge.svelte';
  import { useIdbTable } from '$lib/hooks/useIdbTable';
  import {
    createStone,
    currentStoneId,
    filteredStones,
    loadStones,
    removeStone,
    resetStoneFilters,
    setCurrentStone,
    setKnobStyles,
    setStoneKeyword,
    setStoneTypes,
    stoneFilters,
    stones,
    updateStone,
  } from '$lib/stores/stoneStore';
  import { designs, setCurrentDesign, designsOfStone } from '$lib/stores/designStore';
  import { carves } from '$lib/stores/carveStore';
  import { impressions } from '$lib/stores/impressionStore';
  import {
    KNOB_STYLE_LABEL,
    KNOB_STYLE_OPTIONS,
    STONE_STATE_COLOR,
    STONE_STATE_LABEL,
    STONE_STATE_OPTIONS,
    STONE_TYPE_LABEL,
    STONE_TYPE_OPTIONS,
    createEmptyStoneDraft,
    type KnobStyle,
    type Stone,
    type StoneDraft,
    type StoneState,
    type StoneType,
  } from '$lib/types/stone';
  import { buildStoneStats, describeSize, sealFaceAreaCm2 } from '$lib/utils/stone';
  import type { Catalog } from '$lib/types/catalog';
  import type { Grade } from '$lib/types/impression';
  import { GRADE_WEIGHT, GRADE_LABEL } from '$lib/types/impression';

  // 印谱条目没有独立 store，这里用 useIdbTable 订阅（页面级只读消费）
  const catalogTable = useIdbTable<Catalog>((database) => database.catalogs, { sortByUpdatedAt: false });
  // useIdbTable 返回的是 store 集合对象，需先取出 rows store 再自动订阅
  const catalogRows = catalogTable.rows;

  const queryValues = $derived(parseQuery(router.querystring ?? ''));

  $effect(() => {
    setStoneKeyword(firstValue(queryValues, 'kw'));
    setStoneTypes((queryValues.stoneType ?? []) as StoneType[]);
    setKnobStyles((queryValues.knobStyle ?? []) as KnobStyle[]);
  });

  function updateQuery(patch: Record<string, string | string[] | undefined>): void {
    const merged: Record<string, string[]> = { ...parseQuery(router.querystring ?? '') };
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete merged[key];
      } else {
        merged[key] = Array.isArray(value) ? value : [value];
      }
    });
    const qs = encodeQuery(merged);
    void push(`/stones${qs.length > 0 ? `?${qs}` : ''}`);
  }

  const selects: FilterSelectConfig[] = [
    { key: 'stoneType', label: '石种', options: STONE_TYPE_OPTIONS.map((item) => ({ label: item.label, value: item.value })) },
    { key: 'knobStyle', label: '钮式', options: KNOB_STYLE_OPTIONS.map((item) => ({ label: item.label, value: item.value })) },
  ];

  const statMap = $derived(buildStoneStats($stones, $designs, $carves, $impressions, $catalogRows));

  const totals = $derived({
    stones: $stones.length,
    designs: $designs.length,
    carved: Object.values(statMap).reduce((sum, item) => sum + item.carvedCount, 0),
    idle: $stones.filter((stone) => stone.state === 'idle').length,
    impressions: $impressions.length,
  });

  let dialogOpen = $state(false);
  let editing = $state<Stone | null>(null);
  let draft = $state<StoneDraft>(createEmptyStoneDraft());
  let pendingDelete = $state<Stone | null>(null);

  function openCreate(): void {
    editing = null;
    draft = createEmptyStoneDraft();
    dialogOpen = true;
  }

  function openEdit(stone: Stone): void {
    editing = stone;
    draft = {
      name: stone.name,
      stoneType: stone.stoneType,
      sizeMm: stone.sizeMm,
      knobStyle: stone.knobStyle,
      purchaseDate: stone.purchaseDate,
      state: stone.state,
    };
    dialogOpen = true;
  }

  async function submit(): Promise<void> {
    if (draft.name.trim().length === 0) return;
    if (editing) {
      await updateStone(editing.id, { ...draft });
      editing = null;
    } else {
      await createStone({ ...draft });
    }
    dialogOpen = false;
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    await removeStone(pendingDelete.id);
    pendingDelete = null;
  }

  async function advance(stone: Stone): Promise<void> {
    const order: StoneState[] = ['carving', 'carved', 'idle'];
    const index = order.indexOf(stone.state);
    const next = index < 0 || index >= order.length - 1 ? stone.state : (order[index + 1] as StoneState);
    await updateStone(stone.id, { state: next });
  }

  function bestGradeOf(stoneId: string): Grade | null {
    const stoneDesigns = designsOfStone(stoneId);
    const designIds = stoneDesigns.map((design) => design.id);
    const prints = $impressions.filter((impression) => designIds.includes(impression.designId));
    if (prints.length === 0) return null;
    return [...prints].sort((a, b) => GRADE_WEIGHT[b.grade] - GRADE_WEIGHT[a.grade])[0]?.grade ?? null;
  }

  function openDesigns(stone: Stone): void {
    setCurrentStone(stone.id);
    const first = designsOfStone(stone.id)[0];
    if (first) setCurrentDesign(first.id);
    void push('/designs');
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="text-xl tracking-wide text-ink">印石台账</h2>
      <p class="mt-1 text-sm text-ink-soft">登记石种、钮式与尺寸；卡片回显已刻方数、谱录方数与闲置天数。</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="gb-btn" onclick={() => void push('/carve')}>前往刻制看板</button>
      <button class="gb-btn" onclick={() => void loadStones()}>刷新</button>
      <button class="gb-btn-primary" onclick={openCreate}>新建印石</button>
    </div>
  </div>

  <div class="flex flex-wrap gap-3">
    <StatBadge label="印石总数" value={totals.stones} suffix="方" tone="seal" />
    <StatBadge label="已刻方数" value={totals.carved} suffix="方" tone="jade" />
    <StatBadge label="印稿总数" value={totals.designs} suffix="稿" tone="amber" />
    <StatBadge label="闲置印石" value={totals.idle} suffix="方" />
    <StatBadge label="钤印记录" value={totals.impressions} suffix="次" tone="ink" />
  </div>

  <FilterBar
    keyword={$stoneFilters.keyword}
    placeholder="搜索印石名 / 尺寸 / 购入日期…"
    {selects}
    values={queryValues}
    onKeyword={(value) => updateQuery({ kw: value })}
    onSelect={(key, list) => updateQuery({ [key]: list })}
    onReset={() => {
      resetStoneFilters();
      updateQuery({ kw: undefined, stoneType: undefined, knobStyle: undefined });
    }}
    hint={`共 ${$filteredStones.length} / ${$stones.length} 方`}
  />

  {#if $filteredStones.length === 0}
    <EmptyPanel
      title={$stones.length === 0 ? '还没有登记任何印石' : '当前筛选条件下没有印石'}
      description={$stones.length === 0
        ? '先登记一方印石的石种、钮式与尺寸，再设计印稿并排刻制工序。'
        : '试着放宽石种或钮式条件，或重置筛选。'}
      actionText="新建印石"
      secondaryText="重置筛选"
      onAction={openCreate}
      onSecondary={() => {
        resetStoneFilters();
        updateQuery({ kw: undefined, stoneType: undefined, knobStyle: undefined });
      }}
    />
  {:else}
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each $filteredStones as stone (stone.id)}
        {@const stat = statMap[stone.id]}
        <article
          class="gb-panel transition hover:shadow-lg {$currentStoneId === stone.id ? 'ring-2 ring-seal/40' : ''}"
        >
          <header class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="gb-tag" style="color:#9c2b1f;border-color:#9c2b1f66">{STONE_TYPE_LABEL[stone.stoneType]}</span>
              <span class="font-semibold text-ink">{stone.name}</span>
            </div>
            <span class="gb-tag" style="color:{STONE_STATE_COLOR[stone.state]};border-color:{STONE_STATE_COLOR[stone.state]}66">
              {STONE_STATE_LABEL[stone.state]}
            </span>
          </header>

          <dl class="space-y-1 text-sm text-ink-soft">
            <div>钮式：{KNOB_STYLE_LABEL[stone.knobStyle]} · 购入 {stone.purchaseDate || '未记'}</div>
            <div>{describeSize(stone.sizeMm)}（印面 {sealFaceAreaCm2(stone.sizeMm)} cm²）</div>
            <div>
              已刻 <strong class="text-ink">{stat?.carvedCount ?? 0}</strong> 方 · 印稿 {stat?.designCount ?? 0} 稿 · 谱录
              {stat?.catalogIncluded ?? 0} 方
            </div>
            <div>闲置 {stat?.idleDays ?? 0} 天 · 最近钤印 {stat?.lastStampedAt || '暂无'}</div>
          </dl>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            {#if bestGradeOf(stone.id)}
              <GradeTag grade={bestGradeOf(stone.id) as Grade} size="small" note={`最佳评级 ${GRADE_LABEL[bestGradeOf(stone.id) as Grade]}`} />
            {/if}
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            {#if $currentStoneId !== stone.id}
              <button class="gb-btn" onclick={() => setCurrentStone(stone.id)}>设为当前</button>
            {/if}
            <button class="gb-btn" onclick={() => advance(stone)}>推进状态</button>
            <button class="gb-btn" onclick={() => openDesigns(stone)}>印稿设计</button>
            <button class="gb-btn" onclick={() => openEdit(stone)}>编辑</button>
            <button class="gb-btn-danger" onclick={() => (pendingDelete = stone)}>删除</button>
          </div>
        </article>
      {/each}
    </div>
  {/if}

  <p class="text-xs text-ink-soft">
    提示：印石状态按「在刻 → 已刻 → 闲置」推进；已刻方数按「采用稿 + 工序全部完成」统计，工序完成时自动回写。
  </p>
</div>

{#if dialogOpen}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
    <div class="w-full max-w-lg rounded-xl border border-line bg-paper-light p-5 shadow-xl">
      <h3 class="mb-3 text-lg text-ink">{editing ? `编辑「${editing.name}」` : '新建印石'}</h3>
      <div class="space-y-3">
        <label class="block">
          <span class="gb-label">印石名</span>
          <input class="gb-input" bind:value={draft.name} placeholder="如：寿山黄芙蓉方章" />
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="gb-label">石种</span>
            <select class="gb-input" bind:value={draft.stoneType}>
              {#each STONE_TYPE_OPTIONS as item (item.value)}
                <option value={item.value}>{item.label}</option>
              {/each}
            </select>
          </label>
          <label class="block">
            <span class="gb-label">钮式</span>
            <select class="gb-input" bind:value={draft.knobStyle}>
              {#each KNOB_STYLE_OPTIONS as item (item.value)}
                <option value={item.value}>{item.label}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="block sm:col-span-2">
            <span class="gb-label">尺寸 长×宽×高（mm）</span>
            <input class="gb-input" bind:value={draft.sizeMm} placeholder="25×25×60" />
          </label>
          <label class="block">
            <span class="gb-label">购入日期</span>
            <input class="gb-input" type="date" bind:value={draft.purchaseDate} />
          </label>
        </div>
        <label class="block">
          <span class="gb-label">状态</span>
          <select class="gb-input" bind:value={draft.state}>
            {#each STONE_STATE_OPTIONS as item (item.value)}
              <option value={item.value}>{item.label}</option>
            {/each}
          </select>
        </label>
        <p class="text-xs text-ink-soft">
          尺寸换算预览：{describeSize(draft.sizeMm)} · 印面 {sealFaceAreaCm2(draft.sizeMm)} cm²
        </p>
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
      <h3 class="text-lg text-ink">删除印石</h3>
      <p class="mt-2 text-sm text-ink-soft">
        将同时删除「{pendingDelete.name}」下的印稿、刻制工序、钤印记录与谱录条目，不可恢复。
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button class="gb-btn" onclick={() => (pendingDelete = null)}>取消</button>
        <button class="gb-btn-primary" onclick={() => void confirmDelete()}>确认删除</button>
      </div>
    </div>
  </div>
{/if}
