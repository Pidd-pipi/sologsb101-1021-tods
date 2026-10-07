<script lang="ts">
  /**
   * <GradeTag> 钤印效果评级标签
   * 按优 / 良 / 一般 / 废渲染底色与图标；被钤印比对页与印石台账消费。
   */
  import { GRADE_COLOR, GRADE_ICON, GRADE_LABEL, type Grade } from '$lib/types/impression';

  interface Props {
    grade: Grade;
    size?: 'default' | 'small';
    note?: string;
  }

  let { grade, size = 'default', note = '' }: Props = $props();

  const color = $derived(GRADE_COLOR[grade]);
  const label = $derived(GRADE_LABEL[grade]);
  const icon = $derived(GRADE_ICON[grade]);
</script>

<span
  class="inline-flex items-center gap-1 rounded-full border font-medium {size === 'small'
    ? 'px-2 py-0.5 text-xs'
    : 'px-2.5 py-1 text-sm'}"
  style="color: {color}; border-color: {color}66; background: {color}1a"
  title={note || `效果评级：${label}`}
>
  <span aria-hidden="true">{icon}</span>
  <span>{label}</span>
  {#if note}
    <span class="opacity-70">· {note}</span>
  {/if}
</span>
