/**
 * 合并逻辑验证脚本（不入产物，不参与构建）
 * 1) mergeDuplicateRows 纯函数：重复并组、字段取最近、工序连号、印谱并条目重编号
 * 2) mergeDuplicates 事务：失败时整体回滚，不留半份结果
 * 用 esbuild 临时打包（$lib 别名 → src/lib），fake-indexeddb 提供 IndexedDB。
 */
import 'fake-indexeddb/auto';
import { assert } from 'node:console';
import { mergeDuplicateRows } from '$lib/utils/merge';
import { db, mergeDuplicates } from '$lib/utils/db';
import type { Stone } from '$lib/types/stone';
import type { Design } from '$lib/types/design';
import type { Carve } from '$lib/types/carve';
import type { Impression } from '$lib/types/impression';
import type { Catalog } from '$lib/types/catalog';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}\n      expected: ${e}\n      actual:   ${a}`);
  }
}
function checkTrue(label: string, value: boolean): void {
  if (value) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
}

/* ----------------------------- 构造重复数据 ----------------------------- */

function buildDataset() {
  const stones: Stone[] = [
    // 重复印石：同名同石种同尺寸，两份字段有差异，sA 更新（钮式/状态取 sA）
    { id: 'sA', name: '寿山黄芙蓉方章', stoneType: 'shoushan', sizeMm: '25×25×62', knobStyle: 'bridge', purchaseDate: '2025-11-08', state: 'carved', createdAt: 100, updatedAt: 200 },
    { id: 'sB', name: '寿山黄芙蓉方章', stoneType: 'shoushan', sizeMm: '25×25×62', knobStyle: 'flat', purchaseDate: '2025-11-01', state: 'idle', createdAt: 90, updatedAt: 150 },
    // 不重复
    { id: 'sC', name: '青田封门青素章', stoneType: 'qingtian', sizeMm: '28×28×70', knobStyle: 'bridge', purchaseDate: '2026-01-16', state: 'carving', createdAt: 100, updatedAt: 140 },
    // 同名但尺寸不同 → 不算重复
    { id: 'sD', name: '寿山黄芙蓉方章', stoneType: 'shoushan', sizeMm: '30×30×80', knobStyle: 'flat', purchaseDate: '2026-02-01', state: 'idle', createdAt: 100, updatedAt: 130 },
  ];

  const designs: Design[] = [
    // 重复印稿：同石（sA/sB 归并后）+ 同印文 + 同朱白文；dA 较新 → 保留 dA
    { id: 'dA', stoneId: 'sA', sealText: '澄怀观道', annotation: '四字朱文新释文', style: 'zhu', borderStyle: 'borrow', layoutNote: '新版章法', adopted: true, createdAt: 110, updatedAt: 210 },
    { id: 'dB', stoneId: 'sB', sealText: '澄怀观道', annotation: '旧释文', style: 'zhu', borderStyle: 'none', layoutNote: '旧章法', adopted: false, createdAt: 105, updatedAt: 160 },
    // 同印文但一白文 → 在印石合并后 dC/dD 同石同文同白文，也应并成一稿（保留较新的 dD）
    { id: 'dC', stoneId: 'sA', sealText: '澄怀', annotation: '白文小印', style: 'bai', borderStyle: 'none', layoutNote: '', adopted: false, createdAt: 110, updatedAt: 150 },
    { id: 'dD', stoneId: 'sB', sealText: '澄怀', annotation: '白文小印副本', style: 'bai', borderStyle: 'double', layoutNote: '', adopted: false, createdAt: 108, updatedAt: 155 },
    // sC 上的稿子（不重复）
    { id: 'dE', stoneId: 'sC', sealText: '日新其德', annotation: '白文', style: 'bai', borderStyle: 'double', layoutNote: '', adopted: true, createdAt: 120, updatedAt: 170 },
  ];

  const carves: Carve[] = [
    // dA 自己 2 道工序
    { id: 'c1', designId: 'dA', seq: 1, knifeMethod: 'chong', minutes: 40, operator: '顾墨', state: 'done', createdAt: 1, updatedAt: 1 },
    { id: 'c2', designId: 'dA', seq: 2, knifeMethod: 'trim', minutes: 15, operator: '顾墨', state: 'done', createdAt: 1, updatedAt: 1 },
    // dB 的 2 道工序 → 迁到 dA，序号变 3、4
    { id: 'c3', designId: 'dB', seq: 1, knifeMethod: 'qie', minutes: 30, operator: '林砚', state: 'doing', createdAt: 1, updatedAt: 1 },
    { id: 'c4', designId: 'dB', seq: 2, knifeMethod: 'trim', minutes: 10, operator: '林砚', state: 'todo', createdAt: 1, updatedAt: 1 },
    // dE 的工序不动
    { id: 'c5', designId: 'dE', seq: 1, knifeMethod: 'chong', minutes: 40, operator: '林砚', state: 'done', createdAt: 1, updatedAt: 1 },
  ];

  const impressions: Impression[] = [
    { id: 'i1', designId: 'dA', inkBrand: '西泠印泥', paperType: 'lianshi', pressure: 'medium', grade: 'excellent', stampedAt: '2026-01-20', note: '', createdAt: 1, updatedAt: 1 },
    // dB 的钤印 → 迁到 dA
    { id: 'i2', designId: 'dB', inkBrand: '漳州八宝', paperType: 'xuan', pressure: 'heavy', grade: 'fair', stampedAt: '2026-01-18', note: '边栏糊', createdAt: 1, updatedAt: 1 },
    { id: 'i3', designId: 'dE', inkBrand: '苏州姜思序堂', paperType: 'luowen', pressure: 'light', grade: 'good', stampedAt: '2026-03-02', note: '', createdAt: 1, updatedAt: 1 },
  ];

  const catalogs: Catalog[] = [
    // 指着同一印稿（合并后都指向 dA）的两条 → 并成一条，取较新的 cata_B
    { id: 'catA', stoneId: 'sA', designId: 'dA', orderNo: 1, included: 'included', note: '旧条目', createdAt: 1, updatedAt: 100 },
    { id: 'catB', stoneId: 'sB', designId: 'dB', orderNo: 3, included: 'pending', note: '新条目', createdAt: 2, updatedAt: 300 },
    // sC/dE 的条目，原 orderNo 2
    { id: 'catC', stoneId: 'sC', designId: 'dE', orderNo: 2, included: 'included', note: '', createdAt: 1, updatedAt: 200 },
  ];

  return { stones, designs, carves, impressions, catalogs };
}

/* --------------------------------- 纯函数 --------------------------------- */

console.log('mergeDuplicateRows:');
const now = 9999;
const r = mergeDuplicateRows(buildDataset(), now);

check('印石并为 3 方（sA/sB 合一，保留 sA）', r.stones.map((s) => s.id).sort(), ['sA', 'sC', 'sD']);
check('保留印石字段取最近改动那份（knobStyle=bridge / state=carved）', {
  knob: r.stones.find((s) => s.id === 'sA')?.knobStyle,
  state: r.stones.find((s) => s.id === 'sA')?.state,
  purchase: r.stones.find((s) => s.id === 'sA')?.purchaseDate,
}, { knob: 'bridge', state: 'carved', purchase: '2025-11-08' });
check('stoneIdMap: sB → sA', r.stoneIdMap, { sB: 'sA' });

check('印稿并为 3 稿（朱文 dA/dB 合一、白文 dC/dD 合一，保留各稿较新那份）', r.designs.map((d) => d.id).sort(), ['dA', 'dD', 'dE']);
check('白文并组保留较新的 dD（double 边框 / 副本释文）', {
  border: r.designs.find((d) => d.id === 'dD')?.borderStyle,
  annotation: r.designs.find((d) => d.id === 'dD')?.annotation,
  stoneId: r.designs.find((d) => d.id === 'dD')?.stoneId,
}, { border: 'double', annotation: '白文小印副本', stoneId: 'sA' });
check('保留印稿字段取最近改动那份', {
  annotation: r.designs.find((d) => d.id === 'dA')?.annotation,
  border: r.designs.find((d) => d.id === 'dA')?.borderStyle,
  layout: r.designs.find((d) => d.id === 'dA')?.layoutNote,
  adopted: r.designs.find((d) => d.id === 'dA')?.adopted,
}, { annotation: '四字朱文新释文', border: 'borrow', layout: '新版章法', adopted: true });
check('dA 的 stoneId 仍为 sA，dB 已消失', {
  dAStone: r.designs.find((d) => d.id === 'dA')?.stoneId,
  hasDB: r.designs.some((d) => d.id === 'dB'),
}, { dAStone: 'sA', hasDB: false });
check('designIdMap: dB → dA、dC → dD', r.designIdMap, { dB: 'dA', dC: 'dD' });

const dACarves = r.carves.filter((c) => c.designId === 'dA').sort((a, b) => a.seq - b.seq);
check('两边工序都留在 dA 上并连号 1..4', dACarves.map((c) => [c.id, c.seq]), [
  ['c1', 1], ['c2', 2], ['c3', 3], ['c4', 4],
]);
check('迁移工序保留原刀法/时长/执刀人/状态', dACarves.map((c) => [c.id, c.knifeMethod, c.minutes, c.operator, c.state]), [
  ['c1', 'chong', 40, '顾墨', 'done'],
  ['c2', 'trim', 15, '顾墨', 'done'],
  ['c3', 'qie', 30, '林砚', 'doing'],
  ['c4', 'trim', 10, '林砚', 'todo'],
]);
check('迁移工序 updatedAt 被刷新，未动的保持原值', {
  c1: r.carves.find((c) => c.id === 'c1')?.updatedAt,
  c3: r.carves.find((c) => c.id === 'c3')?.updatedAt,
}, { c1: 1, c3: now });
check('movedCarves = 2（迁来的两道，序号都变了）', r.summary.movedCarves, 2);
check('没有工序再指向 dB', r.carves.some((c) => c.designId === 'dB'), false);

check('钤印都保留且 i2 归到 dA', r.impressions.map((i) => [i.id, i.designId]).sort(), [
  ['i1', 'dA'], ['i2', 'dA'], ['i3', 'dE'],
]);
check('movedImpressions = 1', r.summary.movedImpressions, 1);

check('印谱并为 2 条，无指向 dB/sB 的残留', r.catalogs.map((c) => [c.id, c.stoneId, c.designId]).sort(), [
  ['catB', 'sA', 'dA'], ['catC', 'sC', 'dE'],
]);
// catB 组以原 orderNo=3 排在 catC(orderNo=2) 之后 → 新序号 catC=1、catB=2
check('全谱按保留条目原 orderNo 重新编号', r.catalogs.map((c) => [c.id, c.orderNo]), [
  ['catC', 1], ['catB', 2],
]);
check('并组保留最近改动那份（catB 的状态/备注）', {
  included: r.catalogs.find((c) => c.id === 'catB')?.included,
  note: r.catalogs.find((c) => c.id === 'catB')?.note,
}, { included: 'pending', note: '新条目' });
check('summary', r.summary, { mergedStones: 1, mergedDesigns: 2, movedCarves: 2, movedImpressions: 1, mergedCatalogs: 1 });

// 幂等：对已合并结果再跑一次应没有任何变化
const again = mergeDuplicateRows(r, now + 1);
check('再次合并：印石/印稿/印谱计数不变', {
  stones: again.stones.length,
  designs: again.designs.length,
  carves: again.carves.length,
  impressions: again.impressions.length,
  catalogs: again.catalogs.length,
}, { stones: 3, designs: 3, carves: 5, impressions: 3, catalogs: 2 });
check('再次合并 summary 全零', again.summary, { mergedStones: 0, mergedDesigns: 0, movedCarves: 0, movedImpressions: 0, mergedCatalogs: 0 });
check('幂等后所有行与上次完全一致', {
  stones: again.stones,
  designs: again.designs,
  carves: again.carves,
  impressions: again.impressions,
  catalogs: again.catalogs,
}, {
  stones: r.stones,
  designs: r.designs,
  carves: r.carves,
  impressions: r.impressions,
  catalogs: r.catalogs,
});

/* ----------------------------- 不合并的边界 ----------------------------- */

console.log('不合并的边界:');
{
  const base = { knobStyle: 'flat' as const, purchaseDate: '2026-01-01', state: 'idle' as const, createdAt: 1, updatedAt: 2 };
  const boundary: ReturnType<typeof buildDataset> = {
    stones: [
      { id: 'x1', name: '同名单章', stoneType: 'shoushan', sizeMm: '25×25×60', ...base },
      { id: 'x2', name: '同名单章', stoneType: 'shoushan', sizeMm: '25×25×61', ...base }, // 尺寸差 1mm
      { id: 'x3', name: '同名单章', stoneType: 'qingtian', sizeMm: '25×25×60', ...base }, // 石种不同
    ],
    designs: [
      { id: 'y1', stoneId: 'x1', sealText: '观道', annotation: '', style: 'zhu', borderStyle: 'none', layoutNote: '', adopted: false, createdAt: 1, updatedAt: 2 },
      { id: 'y2', stoneId: 'x1', sealText: '观道', annotation: '', style: 'bai', borderStyle: 'none', layoutNote: '', adopted: false, createdAt: 1, updatedAt: 2 }, // 白文不并
      { id: 'y3', stoneId: 'x1', sealText: '澄怀', annotation: '', style: 'zhu', borderStyle: 'none', layoutNote: '', adopted: false, createdAt: 1, updatedAt: 2 }, // 印文不同不并
    ],
    carves: [],
    impressions: [],
    catalogs: [],
  };
  const b = mergeDuplicateRows(boundary, now);
  check('尺寸/石种不同的同名印石不合并', b.stones.map((s) => s.id), ['x1', 'x2', 'x3']);
  check('朱白文不同、印文不同的印稿不合并', b.designs.map((d) => d.id), ['y1', 'y2', 'y3']);
  check('边界场景 summary 全零', b.summary, { mergedStones: 0, mergedDesigns: 0, movedCarves: 0, movedImpressions: 0, mergedCatalogs: 0 });
}

/* ------------------------------- 事务回滚 ------------------------------- */

console.log('mergeDuplicates 事务:');
await db.open();
const data = buildDataset();
await db.transaction('rw', [db.stones, db.designs, db.carves, db.impressions, db.catalogs], async () => {
  await Promise.all([
    db.stones.bulkPut(data.stones),
    db.designs.bulkPut(data.designs),
    db.carves.bulkPut(data.carves),
    db.impressions.bulkPut(data.impressions),
    db.catalogs.bulkPut(data.catalogs),
  ]);
});

const before = {
  stones: await db.stones.count(),
  designs: await db.designs.count(),
  carves: await db.carves.count(),
  impressions: await db.impressions.count(),
  catalogs: await db.catalogs.count(),
};

// 让「写回」阶段失败：清空之后在 bulkPut 时抛错（mergeDuplicates 用 bulkPut 写回）
const originalBulkPut = db.impressions.bulkPut.bind(db.impressions);
db.impressions.bulkPut = function (): Promise<unknown> {
  throw new Error('模拟磁盘写入失败');
} as never;

let threw = false;
try {
  await mergeDuplicates();
} catch (err) {
  threw = true;
  checkTrue('合并抛错', err instanceof Error && err.message.includes('模拟磁盘写入失败'));
}
db.impressions.bulkPut = originalBulkPut as never;
checkTrue('mergeDuplicates 抛出异常', threw);

const after = {
  stones: await db.stones.count(),
  designs: await db.designs.count(),
  carves: await db.carves.count(),
  impressions: await db.impressions.count(),
  catalogs: await db.catalogs.count(),
};
check('失败后五表条数与合并前一致（整体回滚）', after, before);
checkTrue('被并的印石 sB 仍在', Boolean(await db.stones.get('sB')));
checkTrue('被并印稿的工序 c3 仍在', Boolean(await db.carves.get('c3')));
checkTrue('重复印谱条目 catA 仍在', Boolean(await db.catalogs.get('catA')));
checkTrue('sB 内容未被改写（state 仍为 idle）', (await db.stones.get('sB'))?.state === 'idle');

// 回滚后再正常合并一次，应当成功
const ok = await mergeDuplicates();
check('回滚后重试合并成功（summary）', ok.summary, { mergedStones: 1, mergedDesigns: 2, movedCarves: 2, movedImpressions: 1, mergedCatalogs: 1 });
check('重试后库里实际只剩 3 方印石', await db.stones.count(), 3);
check('重试后印谱实际只剩 2 条且重编号', (await db.catalogs.toArray()).map((c) => [c.id, c.orderNo]).sort(), [['catB', 2], ['catC', 1]]);
checkTrue('重试后工序 c3 已改挂 dA 且序号为 3', (await db.carves.get('c3'))?.designId === 'dA' && (await db.carves.get('c3'))?.seq === 3);

assert(failures === 0);
console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
if (failures > 0) process.exit(1);
