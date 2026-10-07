<script module lang="ts">
  /**
   * 筛选条 query 工具（模块级导出）
   * 应用使用真实路径（history）路由，这里在「路径 + query」与「键值映射」之间互转，
   * 页面把筛选条件写进 URL，刷新或分享链接后可完整还原。
   */
  export interface FilterSelectOption {
    label: string;
    value: string;
  }

  export interface FilterSelectConfig {
    /** query key，同时作为组件内唯一标识 */
    key: string;
    label: string;
    options: FilterSelectOption[];
    multiple?: boolean;
  }

  /** 解析 $lib/router 的 querystring 值 */
  export function parseQuery(querystring: string): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    const normalized = querystring.startsWith('?') ? querystring.slice(1) : querystring;
    if (normalized.length === 0) return result;
    normalized.split('&').forEach((pair) => {
      if (pair.length === 0) return;
      const [rawKey, rawValue = ''] = pair.split('=');
      const key = decodeURIComponent(rawKey ?? '');
      const value = decodeURIComponent(rawValue);
      result[key] = value.length > 0 ? value.split(',').filter((item) => item.length > 0) : [];
    });
    return result;
  }

  /** 生成 query 字符串（不含前导 ?），空值自动省略 */
  export function encodeQuery(patch: Record<string, string | string[] | undefined>): string {
    const parts: string[] = [];
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined) return;
      const text = Array.isArray(value) ? value.filter((item) => item.length > 0).join(',') : value;
      if (text.length === 0) return;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
    });
    return parts.join('&');
  }

  /** 取单值（单选下拉用） */
  export function firstValue(values: Record<string, string[]>, key: string): string {
    return values[key]?.[0] ?? '';
  }
</script>

<script lang="ts">
  /**
   * <FilterBar> 筛选条
   * 关键字 + 多选下拉过滤并同步 URL query；被印石页、刻制看板与钤印页消费。
   */
  interface Props {
    keyword: string;
    placeholder?: string;
    selects: FilterSelectConfig[];
    values: Record<string, string[]>;
    onKeyword: (value: string) => void;
    onSelect: (key: string, values: string[]) => void;
    onReset: () => void;
    /** 右侧附加操作区说明文案 */
    hint?: string;
  }

  let {
    keyword,
    placeholder = '搜索关键字…',
    selects,
    values,
    onKeyword,
    onSelect,
    onReset,
    hint = '',
  }: Props = $props();

  const activeCount = $derived(
    Object.values(values).reduce((sum, list) => sum + list.length, 0) + (keyword.trim().length > 0 ? 1 : 0),
  );

  function toggleOption(key: string, option: string): void {
    const current = values[key] ?? [];
    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option];
    onSelect(key, next);
  }
</script>

<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper-light px-4 py-3">
  <div class="flex flex-1 basis-[520px] flex-wrap items-center gap-3">
    <input
      type="search"
      value={keyword}
      placeholder={placeholder}
      class="w-[220px] rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-seal"
      oninput={(event) => onKeyword((event.currentTarget as HTMLInputElement).value)}
    />

    {#each selects as select (select.key)}
      <div class="flex items-center gap-2">
        <span class="text-xs text-ink-soft">{select.label}</span>
        <div class="flex flex-wrap gap-1">
          {#each select.options as option (option.value)}
            <button
              type="button"
              class="rounded-full border px-2.5 py-1 text-xs transition {(values[select.key] ?? []).includes(
                option.value,
              )
                ? 'border-seal bg-seal/10 text-seal'
                : 'border-line text-ink-soft hover:bg-black/5'}"
              onclick={() => toggleOption(select.key, option.value)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="flex items-center gap-2">
    {#if hint}<span class="text-xs text-ink-soft">{hint}</span>{/if}
    {#if activeCount > 0}
      <span class="rounded-full bg-amber/15 px-2 py-0.5 text-xs text-amber">{activeCount} 项条件</span>
    {/if}
    <button
      type="button"
      class="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-soft transition hover:bg-black/5"
      onclick={onReset}
    >
      重置
    </button>
  </div>
</div>
