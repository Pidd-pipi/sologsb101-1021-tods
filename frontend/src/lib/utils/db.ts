/**
 * IndexedDB 持久化层（Dexie 封装）
 * - 数据结构版本号与升级迁移逻辑（v1 初版；v2 为 impressions 增加 grade 索引、
 *   为 catalogs 增加 orderNo 索引，并回填历史记录缺失字段）
 * - 五张业务表的增删改查与整库导入导出
 * - 首次打开自动播种三层互相引用的演示数据（幂等）
 * 纯前端应用：不依赖任何后端服务或数据库。
 */
import Dexie, { type Table } from 'dexie';
import type { Stone } from '$lib/types/stone';
import type { Design } from '$lib/types/design';
import type { Carve } from '$lib/types/carve';
import type { Impression } from '$lib/types/impression';
import type { Catalog } from '$lib/types/catalog';

/** 数据库名（README 与导出文件均使用该名称） */
export const DB_NAME = 'gbsealcarve';

/** 当前数据结构版本号 */
export const DB_VERSION = 2;

/** localStorage 侧少量元数据键 */
export const LS_KEYS = {
  dbVersion: 'gbsealcarve:db-version',
  lastBackupAt: 'gbsealcarve:last-backup-at',
  uiPrefs: 'gbsealcarve:ui-prefs',
} as const;

export interface UiPrefs {
  lastStoneId: string | null;
  lastDesignId: string | null;
}

export const DEFAULT_UI_PREFS: UiPrefs = { lastStoneId: null, lastDesignId: null };

export function readUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(LS_KEYS.uiPrefs);
    if (!raw) return { ...DEFAULT_UI_PREFS };
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      lastStoneId: typeof parsed.lastStoneId === 'string' ? parsed.lastStoneId : null,
      lastDesignId: typeof parsed.lastDesignId === 'string' ? parsed.lastDesignId : null,
    };
  } catch {
    return { ...DEFAULT_UI_PREFS };
  }
}

export function writeUiPrefs(prefs: UiPrefs): void {
  try {
    localStorage.setItem(LS_KEYS.uiPrefs, JSON.stringify(prefs));
  } catch {
    /* 隐私模式下忽略 */
  }
}

export function stampDbVersion(): void {
  try {
    localStorage.setItem(LS_KEYS.dbVersion, String(DB_VERSION));
  } catch {
    /* ignore */
  }
}

export function readLastBackupAt(): string | null {
  try {
    return localStorage.getItem(LS_KEYS.lastBackupAt);
  } catch {
    return null;
  }
}

export function writeLastBackupAt(value: string): void {
  try {
    localStorage.setItem(LS_KEYS.lastBackupAt, value);
  } catch {
    /* ignore */
  }
}

class SealCarveDatabase extends Dexie {
  stones!: Table<Stone, string>;
  designs!: Table<Design, string>;
  carves!: Table<Carve, string>;
  impressions!: Table<Impression, string>;
  catalogs!: Table<Catalog, string>;

  constructor() {
    super(DB_NAME);

    // v1：初版结构（历史数据保留）
    this.version(1).stores({
      stones: 'id, name, stoneType, state, updatedAt',
      designs: 'id, stoneId, style, adopted, updatedAt',
      carves: 'id, designId, seq, knifeMethod, state, updatedAt',
      impressions: 'id, designId, grade, stampedAt, updatedAt',
      catalogs: 'id, stoneId, designId, orderNo, updatedAt',
    });

    // v2：补充检索索引并回填历史记录缺失字段
    this.version(DB_VERSION)
      .stores({
        stones: 'id, name, stoneType, knobStyle, state, purchaseDate, updatedAt',
        designs: 'id, stoneId, style, borderStyle, adopted, updatedAt',
        carves: 'id, designId, seq, knifeMethod, operator, state, updatedAt',
        impressions: 'id, designId, grade, paperType, stampedAt, updatedAt',
        catalogs: 'id, stoneId, designId, orderNo, included, updatedAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table<Impression>('impressions')
          .toCollection()
          .modify((impression) => {
            const legal = ['excellent', 'good', 'fair', 'waste'];
            if (!legal.includes(impression.grade)) impression.grade = 'good';
            if (typeof impression.note !== 'string') impression.note = '';
          });
        await tx
          .table<Design>('designs')
          .toCollection()
          .modify((design) => {
            if (typeof design.adopted !== 'boolean') design.adopted = false;
            if (!design.borderStyle) design.borderStyle = 'borrow';
          });
        await tx
          .table<Catalog>('catalogs')
          .toCollection()
          .modify((catalog) => {
            if (typeof catalog.orderNo !== 'number' || catalog.orderNo <= 0) catalog.orderNo = 1;
            if (!catalog.included) catalog.included = 'pending';
          });
      });
  }
}

export const db = new SealCarveDatabase();

/** 生成主键：短前缀 + 时间戳 + 随机串 */
export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/** 打开数据库并在首次使用时播种演示数据（幂等） */
export async function initDatabase(): Promise<void> {
  await db.open();
  stampDbVersion();
  if ((await db.stones.count()) === 0) {
    await seedDatabase();
  }
}

/* ------------------------------ 播种数据 ------------------------------ */
/* 三层互相引用：Stone → Design →（Carve / Impression）＋ Stone → Catalog */

export async function seedDatabase(): Promise<void> {
  const now = Date.now();
  const day = 86400000;

  const stones: Stone[] = [
    {
      id: 'stone_01',
      name: '寿山黄芙蓉方章',
      stoneType: 'shoushan',
      sizeMm: '25×25×62',
      knobStyle: 'flat',
      purchaseDate: '2025-11-08',
      state: 'carved',
      createdAt: now - day * 90,
      updatedAt: now - day * 4,
    },
    {
      id: 'stone_02',
      name: '青田封门青素章',
      stoneType: 'qingtian',
      sizeMm: '28×28×70',
      knobStyle: 'bridge',
      purchaseDate: '2026-01-16',
      state: 'carving',
      createdAt: now - day * 52,
      updatedAt: now - day * 2,
    },
    {
      id: 'stone_03',
      name: '昌化鸡血石古兽钮',
      stoneType: 'changhua',
      sizeMm: '22×22×55',
      knobStyle: 'beast',
      purchaseDate: '2025-08-21',
      state: 'idle',
      createdAt: now - day * 160,
      updatedAt: now - day * 30,
    },
    {
      id: 'stone_04',
      name: '巴林冻薄意章',
      stoneType: 'balin',
      sizeMm: '20×30×58',
      knobStyle: 'thin',
      purchaseDate: '2026-02-02',
      state: 'carving',
      createdAt: now - day * 30,
      updatedAt: now - day,
    },
  ];

  const designs: Design[] = [
    { id: 'design_0101', stoneId: 'stone_01', sealText: '澄怀观道', annotation: '宗炳《画山水序》语，四字朱文', style: 'zhu', borderStyle: 'borrow', layoutNote: '四字均分，「观」字略收以让边', adopted: true, createdAt: now - day * 70, updatedAt: now - day * 40 },
    { id: 'design_0102', stoneId: 'stone_01', sealText: '澄怀', annotation: '取前稿二字，作小印', style: 'bai', borderStyle: 'none', layoutNote: '二字上下排布，留大片红', adopted: false, createdAt: now - day * 60, updatedAt: now - day * 55 },
    { id: 'design_0201', stoneId: 'stone_02', sealText: '日新其德', annotation: '《礼记·大学》语，白文', style: 'bai', borderStyle: 'double', layoutNote: '双边仿汉印，「德」字略长', adopted: true, createdAt: now - day * 40, updatedAt: now - day * 6 },
    { id: 'design_0301', stoneId: 'stone_03', sealText: '金石为开', annotation: '汉谚，朱文借边', style: 'zhu', borderStyle: 'borrow', layoutNote: '借边求满，四字紧凑', adopted: true, createdAt: now - day * 120, updatedAt: now - day * 100 },
    { id: 'design_0401', stoneId: 'stone_04', sealText: '清风徐来', annotation: '《赤壁赋》语，瓦当式', style: 'zhu', borderStyle: 'tile', layoutNote: '瓦当圆框，「来」字压缩', adopted: true, createdAt: now - day * 20, updatedAt: now - day * 2 },
  ];

  const carves: Carve[] = [
    { id: 'carve_010101', designId: 'design_0101', seq: 1, knifeMethod: 'chong', minutes: 40, operator: '顾墨', state: 'done', createdAt: now - day * 66, updatedAt: now - day * 64 },
    { id: 'carve_010102', designId: 'design_0101', seq: 2, knifeMethod: 'qie', minutes: 30, operator: '顾墨', state: 'done', createdAt: now - day * 64, updatedAt: now - day * 62 },
    { id: 'carve_010103', designId: 'design_0101', seq: 3, knifeMethod: 'trim', minutes: 15, operator: '顾墨', state: 'done', createdAt: now - day * 62, updatedAt: now - day * 40 },
    { id: 'carve_020101', designId: 'design_0201', seq: 1, knifeMethod: 'chong', minutes: 40, operator: '林砚', state: 'done', createdAt: now - day * 36, updatedAt: now - day * 34 },
    { id: 'carve_020102', designId: 'design_0201', seq: 2, knifeMethod: 'double', minutes: 25, operator: '林砚', state: 'doing', createdAt: now - day * 34, updatedAt: now - day * 3 },
    { id: 'carve_020103', designId: 'design_0201', seq: 3, knifeMethod: 'trim', minutes: 15, operator: '林砚', state: 'todo', createdAt: now - day * 34, updatedAt: now - day * 6 },
    { id: 'carve_030101', designId: 'design_0301', seq: 1, knifeMethod: 'chong', minutes: 45, operator: '顾墨', state: 'done', createdAt: now - day * 115, updatedAt: now - day * 112 },
    { id: 'carve_030102', designId: 'design_0301', seq: 2, knifeMethod: 'trim', minutes: 20, operator: '顾墨', state: 'done', createdAt: now - day * 112, updatedAt: now - day * 100 },
    { id: 'carve_040101', designId: 'design_0401', seq: 1, knifeMethod: 'qie', minutes: 30, operator: '林砚', state: 'doing', createdAt: now - day * 16, updatedAt: now - day * 2 },
  ];

  const impressions: Impression[] = [
    { id: 'impr_010101', designId: 'design_0101', inkBrand: '西泠印泥', paperType: 'lianshi', pressure: 'medium', grade: 'excellent', stampedAt: '2026-01-20', note: '采用稿效果，朱色匀净', createdAt: now - day * 60, updatedAt: now - day * 60 },
    { id: 'impr_010102', designId: 'design_0101', inkBrand: '漳州八宝', paperType: 'xuan', pressure: 'heavy', grade: 'fair', stampedAt: '2026-01-18', note: '压力偏重，边栏糊', createdAt: now - day * 62, updatedAt: now - day * 62 },
    { id: 'impr_020101', designId: 'design_0201', inkBrand: '苏州姜思序堂', paperType: 'luowen', pressure: 'light', grade: 'good', stampedAt: '2026-03-02', note: '', createdAt: now - day * 20, updatedAt: now - day * 20 },
    { id: 'impr_030101', designId: 'design_0301', inkBrand: '西泠印泥', paperType: 'lianshi', pressure: 'medium', grade: 'excellent', stampedAt: '2025-12-12', note: '旧作重钤，效果稳定', createdAt: now - day * 105, updatedAt: now - day * 105 },
    { id: 'impr_030102', designId: 'design_0301', inkBrand: '自制朱磦', paperType: 'lianshi', pressure: 'light', grade: 'waste', stampedAt: '2025-12-20', note: '印泥过干，效果不佳', createdAt: now - day * 100, updatedAt: now - day * 100 },
    { id: 'impr_040101', designId: 'design_0401', inkBrand: '西泠印泥', paperType: 'xuan', pressure: 'medium', grade: 'good', stampedAt: '2026-03-08', note: '试钤一版，待修边后再钤', createdAt: now - day * 2, updatedAt: now - day * 2 },
  ];

  const catalogs: Catalog[] = [
    { id: 'cata_0101', stoneId: 'stone_01', designId: 'design_0101', orderNo: 1, included: 'included', note: '印谱首方', createdAt: now - day * 50, updatedAt: now - day * 50 },
    { id: 'cata_0201', stoneId: 'stone_02', designId: 'design_0201', orderNo: 2, included: 'pending', note: '待修整完稿后收录', createdAt: now - day * 30, updatedAt: now - day * 6 },
    { id: 'cata_0301', stoneId: 'stone_03', designId: 'design_0301', orderNo: 3, included: 'included', note: '鸡血石代表方', createdAt: now - day * 95, updatedAt: now - day * 95 },
    { id: 'cata_0401', stoneId: 'stone_04', designId: 'design_0401', orderNo: 4, included: 'excluded', note: '此稿暂不收录，另拟新稿', createdAt: now - day * 10, updatedAt: now - day * 2 },
  ];

  await db.transaction('rw', [db.stones, db.designs, db.carves, db.impressions, db.catalogs], async () => {
    await db.stones.bulkPut(stones);
    await db.designs.bulkPut(designs);
    await db.carves.bulkPut(carves);
    await db.impressions.bulkPut(impressions);
    await db.catalogs.bulkPut(catalogs);
  });
}

/* ------------------------------ 整库导入导出 ------------------------------ */

export interface SealCarveSnapshot {
  app: typeof DB_NAME;
  schemaVersion: number;
  exportedAt: string;
  stones: Stone[];
  designs: Design[];
  carves: Carve[];
  impressions: Impression[];
  catalogs: Catalog[];
}

export async function exportSnapshot(): Promise<SealCarveSnapshot> {
  const [stones, designs, carves, impressions, catalogs] = await Promise.all([
    db.stones.toArray(),
    db.designs.toArray(),
    db.carves.toArray(),
    db.impressions.toArray(),
    db.catalogs.toArray(),
  ]);
  return {
    app: DB_NAME,
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    stones,
    designs,
    carves,
    impressions,
    catalogs,
  };
}

/** 校验导入文件结构，返回错误文案（空串表示通过） */
export function validateSnapshot(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '文件内容不是合法的 JSON 对象';
  const snapshot = input as Partial<SealCarveSnapshot>;
  if (snapshot.app !== DB_NAME) return `备份文件不属于本项目（app=${String(snapshot.app)}）`;
  const keys: Array<keyof SealCarveSnapshot> = ['stones', 'designs', 'carves', 'impressions', 'catalogs'];
  for (const key of keys) {
    if (!Array.isArray(snapshot[key])) return `备份文件缺少 ${String(key)} 集合`;
  }
  return '';
}

export async function clearAllTables(): Promise<void> {
  await db.transaction('rw', [db.stones, db.designs, db.carves, db.impressions, db.catalogs], async () => {
    await Promise.all([
      db.stones.clear(),
      db.designs.clear(),
      db.carves.clear(),
      db.impressions.clear(),
      db.catalogs.clear(),
    ]);
  });
}

export async function importSnapshot(snapshot: SealCarveSnapshot): Promise<void> {
  await clearAllTables();
  await db.transaction('rw', [db.stones, db.designs, db.carves, db.impressions, db.catalogs], async () => {
    await db.stones.bulkPut(snapshot.stones);
    await db.designs.bulkPut(snapshot.designs);
    await db.carves.bulkPut(snapshot.carves);
    await db.impressions.bulkPut(snapshot.impressions);
    await db.catalogs.bulkPut(snapshot.catalogs);
  });
}

export async function resetDatabase(): Promise<void> {
  await clearAllTables();
  await seedDatabase();
}

export async function countAll(): Promise<Record<string, number>> {
  const [stones, designs, carves, impressions, catalogs] = await Promise.all([
    db.stones.count(),
    db.designs.count(),
    db.carves.count(),
    db.impressions.count(),
    db.catalogs.count(),
  ]);
  return { stones, designs, carves, impressions, catalogs };
}

/** 级联删除印石 → 印稿 → 工序 / 钤印 / 印谱条目 */
export async function removeStoneCascade(stoneId: string): Promise<void> {
  const designIds = (await db.designs.where('stoneId').equals(stoneId).toArray()).map((row) => row.id);
  await db.transaction('rw', [db.stones, db.designs, db.carves, db.impressions, db.catalogs], async () => {
    if (designIds.length > 0) {
      await db.carves.where('designId').anyOf(designIds).delete();
      await db.impressions.where('designId').anyOf(designIds).delete();
      await db.catalogs.where('designId').anyOf(designIds).delete();
    }
    await db.designs.where('stoneId').equals(stoneId).delete();
    await db.catalogs.where('stoneId').equals(stoneId).delete();
    await db.stones.delete(stoneId);
  });
}

/** 级联删除印稿 → 工序 / 钤印 / 印谱条目，并重编号印谱 */
export async function removeDesignCascade(designId: string): Promise<void> {
  const catalog = await db.catalogs.where('designId').equals(designId).toArray();
  const stoneId = catalog[0]?.stoneId;
  await db.transaction('rw', [db.designs, db.carves, db.impressions, db.catalogs], async () => {
    await db.carves.where('designId').equals(designId).delete();
    await db.impressions.where('designId').equals(designId).delete();
    await db.catalogs.where('designId').equals(designId).delete();
    await db.designs.delete(designId);
  });
  if (stoneId) await renumberCatalog(stoneId);
}

/** 印谱条目按序重编号（排序号连续） */
export async function renumberCatalog(stoneId?: string): Promise<void> {
  const rows = stoneId
    ? await db.catalogs.where('stoneId').equals(stoneId).toArray()
    : await db.catalogs.toArray();
  const sorted = [...rows].sort((a, b) =>
    a.orderNo === b.orderNo ? a.createdAt - b.createdAt : a.orderNo - b.orderNo,
  );
  await db.catalogs.bulkPut(sorted.map((row, index) => ({ ...row, orderNo: index + 1, updatedAt: Date.now() })));
}
