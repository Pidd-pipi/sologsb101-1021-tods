// 应用入口（JavaScript）：index.html 引用本文件，实际引导逻辑在同目录 main.ts（TypeScript）中实现。
import { bootstrap } from './main.ts';

const target = document.getElementById('app');
if (target) {
  bootstrap(target);
} else {
  throw new Error('未找到 #app 挂载节点');
}
