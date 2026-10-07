<script lang="ts">
  /**
   * <StatBadge> 方数与完成占比徽标
   * 被刻制看板（/carve）与印谱页（/catalog）消费。
   */
  interface Props {
    label: string;
    value: string | number;
    suffix?: string;
    /** 0-100 的占比，传入后渲染进度条 */
    percent?: number;
    tone?: 'default' | 'seal' | 'amber' | 'jade' | 'ink';
    size?: 'default' | 'small';
  }

  let { label, value, suffix = '', percent, tone = 'default', size = 'default' }: Props = $props();

  const toneColor: Record<string, string> = {
    default: '#4c5254',
    seal: '#9c2b1f',
    amber: '#b98a3c',
    jade: '#3f6b57',
    ink: '#23282a',
  };

  const color = $derived(toneColor[tone] ?? toneColor.default);
  const shown = $derived(percent === undefined ? null : Math.min(100, Math.max(0, Math.round(percent))));
</script>

<div
  class="flex flex-col gap-1.5 rounded-xl border border-line bg-paper-light shadow-card {size === 'small'
    ? 'min-w-[104px] px-2.5 py-2'
    : 'min-w-[136px] px-3.5 py-3'}"
  style="border-left: 4px solid {color}"
>
  <span class="text-xs text-ink-soft">{label}</span>
  <span class="flex items-baseline gap-1">
    <span class="font-bold tabular-nums {size === 'small' ? 'text-lg' : 'text-2xl'}">{value}</span>
    {#if suffix}<span class="text-xs text-ink-soft">{suffix}</span>{/if}
  </span>
  {#if shown !== null}
    <span class="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
      <span class="block h-full rounded-full" style="width: {shown}%; background: {color}"></span>
    </span>
  {/if}
</div>
