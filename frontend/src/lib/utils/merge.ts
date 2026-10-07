/**
 * 重复档案归并（纯函数规划层）
 *
 * 两位作者分别导入旧备份后，同一方印石、同一方印稿会各存两条，
 * 工序、钤印、印谱条目也随之分成两处。这里按以下规则规划归并：
 *
 * 1. 印石：name + stoneType + sizeMm 相同的视为同一方，合成一条；
 * 2. 印稿：在同一方石头上 sealText + style（朱文/白文）相同的视为同一稿，合成一条；
 * 3. 合成一条时整条记录取「最近改动」（updatedAt 最大）的那份（id 也以它为准）；
 * 4. 两份上各自的工序、钤印都保留，统一挂到保留下来的印稿上；
 * 5. 印谱里指向同一印稿的多余条目合成一条（取最近改动的那份），全谱按序重编号。
 *
 * 本文件只做数据规划、不触碰 IndexedDB，便于整体放进单事务执行（失败即整体回滚）。
 */
import type { Stone } from '$lib/types/stone';
import type { Design } from '$lib/types/design';
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

export interface MergePlan extends MergeInput {
  /** 被并掉的印石 id → 保留的印石 id */
  mergedStoneIds: Record<string, string>;
  /** 被并掉的印稿 id → 保留的印稿 id */
  mergedDesignIds: Record<string, string>;
  /** 被并掉的印谱条目 id（指向同一印稿的多余条目） */
  removedCatalogIds: string[];
  /** 归并掉的印石方数（同组 n 条算 n-1 方） */
  mergedStoneCount: number;
  /** 归并掉的印稿稿数 */
  mergedDesignCount: number;
  /** 并掉的印谱条目数 */
  mergedCatalogCount: number;
  /** 是否发生过任何变化（幂等：无重复时为 false，原样返回） */
  changed: boolean;
}

/** 最近改动优先（updatedAt 相同再比 createdAt、id），大者整条保留 */
function byLatestDesc<T extends { updatedAt: number; createdAt: number; id: string }>(
  a: T,
  b: T,
): number {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id);
}

/** 校验引用完整性：任一子记录指向不存在的父记录即视为数据损坏，拒绝归并 */
export function assertReferencesIntact(input: MergeInput): void {
  const stoneIds = new Set(input.stones.map((row) => row.id));
  const designIds = new Set(input.designs.map((row) => row.id));
  for (const design of input.designs) {
    if (!stoneIds.has(design.stoneId)) {
      throw new Error(`印稿 ${design.id} 指向不存在的印石 ${design.stoneId}，已取消归并`);
    }
  }
  for (const carve of input.carves) {
    if (!designIds.has(carve.designId)) {
      throw new Error(`工序 ${carve.id} 指向不存在的印稿 ${carve.designId}，已取消归并`);
    }
  }
  for (const impression of input.impressions) {
    if (!designIds.has(impression.designId)) {
      throw new Error(`钤印 ${impression.id} 指向不存在的印稿 ${impression.designId}，已取消归并`);
    }
  }
  for (const catalog of input.catalogs) {
    if (!stoneIds.has(catalog.stoneId)) {
      throw new Error(`印谱条目 ${catalog.id} 指向不存在的印石 ${catalog.stoneId}，已取消归并`);
    }
    if (!designIds.has(catalog.designId)) {
      throw new Error(`印谱条目 ${catalog.id} 指向不存在的印稿 ${catalog.designId}，已取消归并`);
    }
  }
}

/**
 * 规划一次重复归并。纯函数：相同输入必得相同输出，无重复时原样返回（changed=false）。
 */
export function planMerge(input: MergeInput, now: number = Date.now()): MergePlan {
  assertReferencesIntact(input);

  /* ---------------- 1. 合并印石：name + stoneType + sizeMm 相同 ---------------- */
  const stoneGroups = new Map<string, Stone[]>();
  for (const stone of input.stones) {
    const key = `${stone.name}${stone.stoneType}${stone.sizeMm}`;
    const group = stoneGroups.get(key);
    if (group) group.push(stone);
    else stoneGroups.set(key, [stone]);
  }

  const mergedStoneIds: Record<string, string> = {};
  const mergedStones: Stone[] = [];
  let mergedStoneCount = 0;
  for (const group of stoneGroups.values()) {
    const sorted = [...group].sort(byLatestDesc);
    const keep = sorted[0] as Stone;
    mergedStones.push(keep);
    for (const dropped of sorted.slice(1)) {
      mergedStoneIds[dropped.id] = keep.id;
      mergedStoneCount += 1;
    }
  }

  /* ---------------- 2. 合并印稿：同一方石上 sealText + style 相同 ---------------- */
  const designGroups = new Map<string, Design[]>();
  for (const design of input.designs) {
    // 先把被并印石上的印稿归到保留印石名下再判重
    const effectiveStoneId = mergedStoneIds[design.stoneId] ?? design.stoneId;
    const key = `${effectiveStoneId}${design.sealText}${design.style}`;
    const group = designGroups.get(key);
    if (group) group.push(design);
    else designGroups.set(key, [design]);
  }

  const mergedDesignIds: Record<string, string> = {};
  const mergedDesigns: Design[] = [];
  let mergedDesignCount = 0;
  for (const group of designGroups.values()) {
    const sorted = [...group].sort(byLatestDesc);
    const keep = sorted[0] as Design;
    // 保留稿整条取最近改动的那份；仅 stoneId 可能因印石合并而需要改挂
    const effectiveStoneId = mergedStoneIds[keep.stoneId] ?? keep.stoneId;
    mergedDesigns.push(
      effectiveStoneId === keep.stoneId
        ? keep
        : { ...keep, stoneId: effectiveStoneId, updatedAt: now },
    );
    for (const dropped of sorted.slice(1)) {
      mergedDesignIds[dropped.id] = keep.id;
      mergedDesignCount += 1;
    }
  }

  /* ---------------- 3. 工序：两边都留，挂到保留稿并重新连续编号 ---------------- */
  // 先按来源稿归集，保留稿自身的工序排在前面，被并稿的工序依次接在后面
  const carvesBySource = new Map<string, Carve[]>();
  for (const carve of input.carves) {
    const list = carvesBySource.get(carve.designId);
    if (list) list.push(carve);
    else carvesBySource.set(carve.designId, [carve]);
  }

  const mergedCarves: Carve[] = [];
  let carvesChanged = false;
  // 目标保留稿 id → 该组各来源稿 id（保留稿排第一，其余按最近改动、序号排序）
  const designSourceOrder = new Map<string, string[]>();
  for (const sourceId of carvesBySource.keys()) {
    const targetId = mergedDesignIds[sourceId] ?? sourceId;
    const order = designSourceOrder.get(targetId) ?? [];
    order.push(sourceId);
    designSourceOrder.set(targetId, order);
  }

  for (const [targetId, sourceIds] of designSourceOrder) {
    const keptSource = sourceIds.includes(targetId) ? targetId : undefined;
    const orderedSources = [
      ...(keptSource ? [keptSource] : []),
      ...sourceIds
        .filter((id) => id !== keptSource)
        .sort((a, b) => {
          const da = input.designs.find((row) => row.id === a);
          const db2 = input.designs.find((row) => row.id === b);
          return byLatestDesc(da as Design, db2 as Design);
        }),
    ];

    const orderedCarves: Carve[] = [];
    let reparentedAny = false;
    for (const sourceId of orderedSources) {
      const rows = [...(carvesBySource.get(sourceId) ?? [])].sort(
        (a, b) => a.seq - b.seq || byLatestDesc(b, a),
      );
      for (const row of rows) {
        if (row.designId === targetId) {
          orderedCarves.push(row);
        } else {
          orderedCarves.push({ ...row, designId: targetId, updatedAt: now });
          reparentedAny = true;
        }
      }
    }

    // 多来源合并（序号必然冲突）或现有序号不连续时，按合并后的顺序连续重编号
    const needRenumber =
      orderedSources.length > 1 || orderedCarves.some((row, index) => row.seq !== index + 1);
    if (needRenumber || reparentedAny) {
      carvesChanged = true;
      orderedCarves.forEach((row, index) => {
        mergedCarves.push({ ...row, seq: index + 1, updatedAt: now });
      });
    } else {
      mergedCarves.push(...orderedCarves);
    }
  }

  /* ---------------- 4. 钤印：两边都留，改挂到保留稿 ---------------- */
  let impressionsChanged = false;
  const mergedImpressions: Impression[] = input.impressions.map((impression) => {
    const targetId = mergedDesignIds[impression.designId];
    if (!targetId || targetId === impression.designId) return impression;
    impressionsChanged = true;
    return { ...impression, designId: targetId, updatedAt: now };
  });

  /* ---------------- 5. 印谱：同稿多条合并 → 改挂引用 → 全谱重编号 ---------------- */
  const removedCatalogIds: string[] = [];
  let mergedCatalogCount = 0;
  let catalogsChanged = false;

  // 先按合并后的印稿归组（须在改挂之前，按各自原始 updatedAt 判定「最近改动」），
  // 同一印稿的多余条目并成一条，整条取最近改动的那份
  const catalogByDesign = new Map<string, Catalog[]>();
  for (const catalog of input.catalogs) {
    const effectiveDesignId = mergedDesignIds[catalog.designId] ?? catalog.designId;
    const list = catalogByDesign.get(effectiveDesignId);
    if (list) list.push(catalog);
    else catalogByDesign.set(effectiveDesignId, [catalog]);
  }
  const dedupedCatalogs: Catalog[] = [];
  for (const [effectiveDesignId, group] of catalogByDesign) {
    if (group.length === 1) {
      dedupedCatalogs.push(group[0] as Catalog);
      continue;
    }
    catalogsChanged = true;
    const sorted = [...group].sort(byLatestDesc);
    const keep = sorted[0] as Catalog;
    if (keep.designId === effectiveDesignId) {
      dedupedCatalogs.push(keep);
    } else {
      // 保留条目以合并后的印稿为准（stoneId 随后一并改挂到保留印石）
      dedupedCatalogs.push({ ...keep, designId: effectiveDesignId, updatedAt: now });
    }
    for (const dropped of sorted.slice(1)) {
      removedCatalogIds.push(dropped.id);
      mergedCatalogCount += 1;
    }
  }

  // 改挂：未参与合并的条目 stoneId / designId 指到合并后保留的记录上
  const remappedCatalogs = dedupedCatalogs.map((catalog) => {
    const stoneId = mergedStoneIds[catalog.stoneId] ?? catalog.stoneId;
    const designId = mergedDesignIds[catalog.designId] ?? catalog.designId;
    if (stoneId === catalog.stoneId && designId === catalog.designId) return catalog;
    catalogsChanged = true;
    // 引用被改挂：整条仍取最近改动那份的内容，仅修正外键，updatedAt 记为本次改动
    return { ...catalog, stoneId, designId, updatedAt: now };
  });

  // 全谱按原排序号（同号按创建先后）重编号为 1…n
  const sortedCatalogs = [...remappedCatalogs].sort(
    (a, b) => a.orderNo - b.orderNo || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const mergedCatalogs: Catalog[] = sortedCatalogs.map((catalog, index) => {
    const orderNo = index + 1;
    if (catalog.orderNo === orderNo) return catalog;
    catalogsChanged = true;
    return { ...catalog, orderNo, updatedAt: now };
  });

  const designsChanged =
    mergedDesignCount > 0 || mergedDesigns.some((design) => mergedStoneIds[design.stoneId]);
  const changed =
    mergedStoneCount > 0 ||
    designsChanged ||
    carvesChanged ||
    impressionsChanged ||
    catalogsChanged;

  return {
    stones: mergedStones.sort((a, b) => a.id.localeCompare(b.id)),
    designs: mergedDesigns.sort((a, b) => a.id.localeCompare(b.id)),
    carves: mergedCarves.sort((a, b) => a.id.localeCompare(b.id)),
    impressions: mergedImpressions.sort((a, b) => a.id.localeCompare(b.id)),
    catalogs: mergedCatalogs.sort((a, b) => a.id.localeCompare(b.id)),
    mergedStoneIds,
    mergedDesignIds,
    removedCatalogIds,
    mergedStoneCount,
    mergedDesignCount,
    mergedCatalogCount,
    changed,
  };
}
