<script lang="ts">
  /**
   * 路由出口：按当前真实路径（router.location）渲染对应模块
   * 未匹配路径渲染 '*' 兜底页，地址保持不变。
   */
  import { resolveRoute, router } from './router.svelte';
  import { routes } from './routes';

  const Page = $derived(resolveRoute(router.location, routes));
</script>

<Page />
