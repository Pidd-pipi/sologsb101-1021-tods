<script lang="ts">
  /**
   * 未命中路由的友好空态（真实路径输错时不会白屏，地址保持不变）
   */
  import { push, router } from '$lib/router';
  import EmptyPanel from '$lib/components/common/EmptyPanel.svelte';
</script>

<div class="mx-auto max-w-3xl">
  <EmptyPanel
    title="未找到该页面"
    description={`当前地址 ${router.location} 不在本应用的 5 个模块（/stones、/designs、/carve、/impressions、/catalog）之内。`}
    actionText="返回印石台账"
    onAction={() => void push('/stones')}
  />
</div>
