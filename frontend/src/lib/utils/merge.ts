/**
 * 重复档案合并（纯函数，不触碰 IndexedDB）
 *
 * 背景：两位作者各自导入过旧备份，同一方印石、同一方印稿在库里各存两条，
 * 工序、钤印与印谱条目也随之分成两处。本模块按既定规则计算合并后的五表：
 *
 * - 印石：印石名 + 石种 + 尺寸都相同视为同一方；
 * - 印稿：同一方石头上，印文 + 朱白文都相同视为同一稿；
 * - 合成一条时字段取最近改动（updatedAt）的那份；
 * - 两边记下的工序、钤印都迁到保留的印稿上（工序按顺序重新连号）；
 * - 印谱里指向同一印稿的多余条目并成一条，随后全谱重新编号。
 *
 * 本文件只做纯计算，事务与回滚由 utils/db.ts 的 mergeDuplicates() 负责。
 */
import type { Stone, StoneType } from '$lib/types/stone';
import type { Design, DesignStyle } from '$lib/types/design';
import type { Carve } from '$lib/types/carve';
import type { Impression } from '$lib/types/impression';
import type { Catalog } from '$lib/types/catalog';

export interface MergeInput {
  stones: Stone[];
  designs: Design[];
  carves: Carve[];
  impressions: Impression[];
  catalogs: Catalog[];
}

export interface MergeResult extends MergeInput {
  /** 合并统计，供页面提示 */
  summary: MergeSummary;
  /** 被并掉的印石 id → 保留的印石 id */
  stoneIdMap: Record<string, string>;
  /** 被并掉的印稿 id → 保留的印稿 id */
  designIdMap: Record<string, string>;
}

export interface MergeSummary {
  /** 并掉的重复印石条数 */
  mergedStones: number;
  /** 并掉的重复印稿条数 */
  mergedDesigns: number;
  /** 迁移到保留印稿上的工序条数（designId 或序号发生变化） */
  movedCarves: number;
  /** 迁移到保留印稿上的钤印条数（designId 发生变化） */
  movedImpressions: number;
  /** 并掉的重复印谱条目数 */
  mergedCatalogs: number;
}

interface Timed {
  updatedAt: number;
  createdAt: number;
  id: string;
}

/**
 * 组内取「最近改动的那份」作为保留行：updatedAt 晚者胜，
 * 相同则比 createdAt，再相同用 id 兜底，保证结果确定。
 */
function newestFirst<T extends Timed>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function pickWinner<T extends Timed>(rows: T[]): T {
  return newestFirst(rows)[0] as T;
}

/** 印石去重键：印石名 + 石种 + 尺寸（均去除首尾空白后比较） */
export function stoneDedupKey(stone: Pick<Stone, 'name' | 'stoneType' | 'sizeMm'>): string {
  return [stone.name.trim(), stone.stoneType, stone.sizeMm.trim()].join('');
}

/** 印稿去重键：同一印石上的印文 + 朱白文 */
export function designDedupKey(
  design: Pick<Design, 'stoneId' | 'sealText' | 'style'>,
  stoneId = design.stoneId,
): string {
  return [stoneId, design.sealText.trim(), design.style].join('');
}

function groupByIdentity<T>(rows: T[], keyOf: (row: T) => string): T[][] {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = keyOf(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  });
  return [...map.values()];
}

/** 校验合并结果的引用完整性与工序连号，任一不满足都应让整笔事务回滚 */
function assertIntegrity(result: {
  stones: Stone[];
  designs: Design[];
  carves: Carve[];
  impressions: Impression[];
  catalogs: Catalog[];
}): void {
  const stoneIds = new Set(result.stones.map((row) => row.id));
  const designIds = new Set(result.designs.map((row) => row.id));

  for (const design of result.designs) {
    if (!stoneIds.has(design.stoneId)) throw new Error(`合并后印稿 ${design.id} 指向已不存在的印石`);
  }
  for (const carve of result.carves) {
    if (!designIds.has(carve.designId)) throw new Error(`合并后工序 ${carve.id} 指向已不存在的印稿`);
  }
  for (const impression of result.impressions) {
    if (!designIds.has(impression.designId)) throw new Error(`合并后钤印 ${impression.id} 指向已不存在的印稿`);
  }
  for (const catalog of result.catalogs) {
    if (!stoneIds.has(catalog.stoneId)) throw new Error(`合并后印谱条目 ${catalog.id} 指向已不存在的印石`);
    if (!designIds.has(catalog.designId)) throw new Error(`合并后印谱条目 ${catalog.id} 指向已不存在的印稿`);
  }

  // 每个保留印稿下的工序序号必须从 1 连续
  const seqsByDesign = new Map<string, number[]>();
  result.carves.forEach((carve) => {
    const seqs = seqsByDesign.get(carve.designId) ?? [];
    seqs.push(carve.seq);
    seqsByDesign.set(carve.designId, seqs);
  });
  seqsByDesign.forEach((seqs) => {
    const sorted = [...seqs].sort((a, b) => a - b);
    if (sorted.some((seq, index) => seq !== index + 1)) {
      throw new Error('合并后工序序号不连续');
    }
  });

  // 印谱排序号必须从 1 连续且无重复
  const orderNos = result.catalogs.map((catalog) => catalog.orderNo).sort((a, b) => a - b);
  if (orderNos.some((orderNo, index) => orderNo !== index + 1)) {
    throw new Error('合并后印谱排序号不连续');
  }
}

/**
 * 计算五表去重合并后的结果。
 * 输入不会被修改；输出包含可直接写回各表的完整行集合与合并统计。
 */
export function mergeDuplicateRows(input: MergeInput, now: number): MergeResult {
  // 1) 印石：同名 + 同石种 + 同尺寸并成一方，保留最近改动的那份
  const stoneIdMap = buildStoneIdMap(input.stones);
  const keptStones = newestFirst(input.stones).filter((stone) => !stoneIdMap[stone.id]);

  // 2) 印稿：先把 stoneId 归并到保留的印石，再按同石 + 同印文 + 同朱白文并稿
  const remappedDesigns = input.designs.map((design) =>
    stoneIdMap[design.stoneId] ? { ...design, stoneId: stoneIdMap[design.stoneId] } : design,
  );
  const designIdMap: Record<string, string> = {};
  const keptDesigns: Design[] = [];
  for (const group of groupByIdentity(remappedDesigns, (design) => designDedupKey(design))) {
    const ordered = newestFirst(group);
    const winner = ordered[0] as Design;
    keptDesigns.push(winner);
    ordered.slice(1).forEach((loser) => {
      designIdMap[loser.id] = winner.id;
    });
  }

  // 3) 工序：两边记下的都留在保留印稿上，按原序连接后重新连号。
  //    保留印稿自己的工序在前（按原序号），被并印稿的工序按其印稿近 → 旧追加。
  const winnerDesignId = (id: string): string => designIdMap[id] ?? id;
  const loserOrder = new Map<string, number>();
  keptDesigns.forEach((winner) => {
    // 最近改动的被并稿排在前：以其 updatedAt 倒序给名次
    const losers = Object.keys(designIdMap)
      .filter((loserId) => designIdMap[loserId] === winner.id)
      .sort((a, b) => {
        const rowA = remappedDesigns.find((design) => design.id === a);
        const rowB = remappedDesigns.find((design) => design.id === b);
        return (rowB?.updatedAt ?? 0) - (rowA?.updatedAt ?? 0);
      });
    losers.forEach((loserId, index) => loserOrder.set(loserId, index + 1));
  });

  const mergedCarves: Carve[] = [];
  let movedCarves = 0;
  keptDesigns.forEach((design) => {
    const own = input.carves
      .filter((carve) => carve.designId === design.id)
      .sort((a, b) => a.seq - b.seq || b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
    const adopted = input.carves
      .filter((carve) => designIdMap[carve.designId] === design.id)
      .sort((a, b) => {
        const rankA = loserOrder.get(a.designId) ?? Number.MAX_SAFE_INTEGER;
        const rankB = loserOrder.get(b.designId) ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        return a.seq - b.seq || b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1);
      });
    [...own, ...adopted].forEach((carve, index) => {
      const seq = index + 1;
      if (carve.designId !== design.id || carve.seq !== seq) movedCarves += 1;
      mergedCarves.push({
        ...carve,
        designId: design.id,
        seq,
        updatedAt: carve.designId !== design.id || carve.seq !== seq ? now : carve.updatedAt,
      });
    });
  });

  // 4) 钤印：两边记下的都保留，仅把 designId 归并到保留印稿
  const mergedImpressions: Impression[] = input.impressions.map((impression) => {
    const targetId = winnerDesignId(impression.designId);
    if (targetId === impression.designId) return impression;
    return { ...impression, designId: targetId, updatedAt: now };
  });
  const movedImpressions = input.impressions.filter(
    (impression) => winnerDesignId(impression.designId) !== impression.designId,
  ).length;

  // 5) 印谱：重写 stoneId / designId 后，同一印稿的多余条目并成一条（取最近改动），
  //    再按各并组保留条目的原排序号全谱重新编号。
  const remappedCatalogs = input.catalogs.map((catalog) => {
    const designId = winnerDesignId(catalog.designId);
    const stoneId = stoneIdMap[catalog.stoneId] ?? catalog.stoneId;
    return designId === catalog.designId && stoneId === catalog.stoneId
      ? catalog
      : { ...catalog, designId, stoneId };
  });

  const catalogGroups = groupByIdentity(remappedCatalogs, (catalog) => catalog.designId);
  // 组的先后：以组内保留条目（最近改动那份）原本的排序号为准，序号相同再比创建时间
  const groupOrder = catalogGroups
    .map((group) => {
      const winner = pickWinner(group);
      return {
        group,
        winner,
        baseOrderNo: winner.orderNo,
        baseCreatedAt: winner.createdAt,
      };
    })
    .sort((a, b) => a.baseOrderNo - b.baseOrderNo || a.baseCreatedAt - b.baseCreatedAt);

  const mergedCatalogs: Catalog[] = [];
  let mergedCatalogCount = 0;
  groupOrder.forEach(({ group }, index) => {
    const winner = pickWinner(group);
    const orderNo = index + 1;
    mergedCatalogs.push({
      ...winner,
      orderNo,
      updatedAt: winner.orderNo !== orderNo ? now : winner.updatedAt,
    });
    mergedCatalogCount += group.length - 1;
  });

  const result: MergeResult = {
    stones: keptStones,
    designs: keptDesigns,
    carves: mergedCarves,
    impressions: mergedImpressions,
    catalogs: mergedCatalogs,
    stoneIdMap,
    designIdMap,
    summary: {
      mergedStones: Object.keys(stoneIdMap).length,
      mergedDesigns: Object.keys(designIdMap).length,
      movedCarves,
      movedImpressions,
      mergedCatalogs: mergedCatalogCount,
    },
  };

  assertIntegrity(result);
  return result;
}

/** 按 identity 键把行分组，并把每个重复组（size > 1）作为待并组返回 */
function duplicateGroupsOf<T>(rows: T[], keyOf: (row: T) => string): T[][] {
  return groupByIdentity(rows, keyOf).filter((group) => group.length > 1);
}

/** 印石重复组的展示结构 */
export interface DuplicateStoneGroup {
  key: string;
  name: string;
  stoneType: StoneType;
  sizeMm: string;
  count: number;
}

/** 印稿重复组的展示结构 */
export interface DuplicateDesignGroup {
  key: string;
  stoneId: string;
  sealText: string;
  style: DesignStyle;
  count: number;
}

export interface DuplicatePreview {
  stoneGroups: DuplicateStoneGroup[];
  designGroups: DuplicateDesignGroup[];
  total: number;
}

/**
 * 预览当前库中的重复（确认弹窗使用）：返回同名同石种同尺寸的印石组，
 * 以及在印石归并之后同石同印文同朱白文的印稿组。
 */
export function previewDuplicates(input: MergeInput): DuplicatePreview {
  const stoneGroups = duplicateGroupsOf(input.stones, stoneDedupKey).map((group) => {
    const first = group[0] as Stone;
    return {
      key: stoneDedupKey(first),
      name: first.name,
      stoneType: first.stoneType,
      sizeMm: first.sizeMm,
      count: group.length,
    };
  });

  const idMap = buildStoneIdMap(input.stones);
  const normalized = input.designs.map((design) =>
    idMap[design.stoneId] ? { ...design, stoneId: idMap[design.stoneId] } : design,
  );
  const designGroups: DuplicateDesignGroup[] = duplicateGroupsOf(normalized, (design) =>
    designDedupKey(design),
  ).map((group) => {
    const first = group[0] as Design;
    return {
      key: designDedupKey(first),
      stoneId: first.stoneId,
      sealText: first.sealText,
      style: first.style,
      count: group.length,
    };
  });

  return {
    stoneGroups,
    designGroups,
    total: stoneGroups.length + designGroups.length,
  };
}

/** 印石 id → 同组保留印石 id（最近改动那份） */
export function buildStoneIdMap(stones: Stone[]): Record<string, string> {
  const idMap: Record<string, string> = {};
  for (const group of groupByIdentity(stones, stoneDedupKey)) {
    const winner = pickWinner(group);
    group.forEach((stone) => {
      if (stone.id !== winner.id) idMap[stone.id] = winner.id;
    });
  }
  return idMap;
}
