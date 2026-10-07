<script lang="ts">
  /**
   * <EmptyPanel> 空数据引导与新建入口
   * 被全部列表页消费；路由未命中时也用它给出友好空态（不白屏）。
   */
  interface Props {
    title: string;
    description?: string;
    actionText?: string;
    secondaryText?: string;
    onAction?: () => void;
    onSecondary?: () => void;
    size?: 'default' | 'small';
  }

  let {
    title,
    description = '',
    actionText = '',
    secondaryText = '',
    onAction,
    onSecondary,
    size = 'default',
  }: Props = $props();
</script>

<div
  class="rounded-xl border border-dashed border-line bg-paper-light text-center {size === 'small'
    ? 'px-4 py-6'
    : 'px-6 py-12'}"
>
  <p class="text-base font-semibold text-ink">{title}</p>
  {#if description}
    <p class="mt-1 text-sm text-ink-soft">{description}</p>
  {/if}
  {#if actionText || secondaryText}
    <div class="mt-4 flex flex-wrap justify-center gap-2">
      {#if actionText && onAction}
        <button
          type="button"
          class="rounded-lg bg-seal px-4 py-2 text-sm font-medium text-paper-light transition hover:bg-seal-soft"
          onclick={onAction}
        >
          {actionText}
        </button>
      {/if}
      {#if secondaryText && onSecondary}
        <button
          type="button"
          class="rounded-lg border border-line px-4 py-2 text-sm text-ink transition hover:bg-black/5"
          onclick={onSecondary}
        >
          {secondaryText}
        </button>
      {/if}
    </div>
  {/if}
</div>
