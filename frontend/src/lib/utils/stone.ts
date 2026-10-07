/**
 * 印石工具
 * - 石种 / 钮式枚举与配色映射（组件统一引用，避免散落硬编码）
 * - 毫米尺寸解析与换算（长×宽×高 → 印面尺寸 / 体积）
 * - 按采购日期排序、闲置天数与印石维度统计
 */
import {
  KNOB_STYLE_LABEL,
  STONE_STATE_LABEL,
  STONE_TYPE_COLOR,
  STONE_TYPE_LABEL,
  type KnobStyle,
  type Stone,
  type StoneStat,
  type StoneState,
  type StoneType,
} from '$lib/types/stone';
import type { Design } from '$lib/types/design';
import type { Carve } from '$lib/types/carve';
import type { Impression } from '$lib/types/impression';
import type { Catalog } from '$lib/types/catalog';

export interface StoneSize {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

/** 解析 "25×25×60" 形式的尺寸字符串；解析失败返回默认值 */
export function parseSizeMm(sizeMm: string): StoneSize {
  const parts = sizeMm
    .split(/[×xX*,\s]+/)
    .map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item) && item > 0);
  return {
    lengthMm: parts[0] ?? 25,
    widthMm: parts[1] ?? parts[0] ?? 25,
    heightMm: parts[2] ?? 60,
  };
}

/** 格式化为 "长×宽×高" */
export function formatSizeMm(lengthMm: number, widthMm: number, heightMm: number): string {
  const round = (value: number): number => Math.round(value * 10) / 10;
  return `${round(lengthMm)}×${round(widthMm)}×${round(heightMm)}`;
}

/** 印面面积（平方厘米） */
export function sealFaceAreaCm2(sizeMm: string): number {
  const { lengthMm, widthMm } = parseSizeMm(sizeMm);
  return Math.round(((lengthMm * widthMm) / 100) * 100) / 100;
}

/** 印石体积（立方厘米） */
export function stoneVolumeCm3(sizeMm: string): number {
  const { lengthMm, widthMm, heightMm } = parseSizeMm(sizeMm);
  return Math.round(((lengthMm * widthMm * heightMm) / 1000) * 100) / 100;
}

/** 尺寸规格文案：如「2.5 × 2.5 cm 印面 · 6.0 cm 高 · 30.0 cm³」 */
export function describeSize(sizeMm: string): string {
  const { lengthMm, widthMm, heightMm } = parseSizeMm(sizeMm);
  const cm = (value: number): string => (value / 10).toFixed(1);
  return `${cm(lengthMm)} × ${cm(widthMm)} cm 印面 · ${cm(heightMm)} cm 高 · ${stoneVolumeCm3(sizeMm)} cm³`;
}

/** 按采购日期排序（早 → 晚）；日期缺失时排末尾 */
export function sortByPurchaseDate(stones: Stone[]): Stone[] {
  return [...stones].sort((a, b) => {
    if (!a.purchaseDate && !b.purchaseDate) return a.name.localeCompare(b.name, 'zh-Hans-CN');
    if (!a.purchaseDate) return 1;
    if (!b.purchaseDate) return -1;
    return a.purchaseDate.localeCompare(b.purchaseDate);
  });
}

/** 距今闲置天数（自最近一次活动起算，无活动则自采购日起算） */
export function idleDays(stone: Stone, lastActivityAt: number): number {
  const base = lastActivityAt > 0 ? lastActivityAt : new Date(stone.purchaseDate || stone.createdAt).getTime();
  if (!Number.isFinite(base) || base <= 0) return 0;
  return Math.max(0, Math.floor((Date.now() - base) / 86400000));
}

/** 石种 / 钮式 / 状态的展示辅助 */
export function stoneTypeLabel(type: StoneType): string {
  return STONE_TYPE_LABEL[type];
}

export function stoneTypeColor(type: StoneType): string {
  return STONE_TYPE_COLOR[type];
}

export function knobStyleLabel(style: KnobStyle): string {
  return KNOB_STYLE_LABEL[style];
}

export function stoneStateLabel(state: StoneState): string {
  return STONE_STATE_LABEL[state];
}

/** 印石维度统计：已刻方数、闲置天数、最近钤印日期、印谱收录方数 */
export function buildStoneStats(
  stones: Stone[],
  designs: Design[],
  carves: Carve[],
  impressions: Impression[],
  catalogs: Catalog[],
): Record<string, StoneStat> {
  const result: Record<string, StoneStat> = {};
  stones.forEach((stone) => {
    const stoneDesigns = designs.filter((design) => design.stoneId === stone.id);
    const designIds = stoneDesigns.map((design) => design.id);
    const stoneCarves = carves.filter((carve) => designIds.includes(carve.designId));
    const stoneImpressions = impressions
      .filter((impression) => designIds.includes(impression.designId))
      .sort((a, b) => a.stampedAt.localeCompare(b.stampedAt));
    const carvedCount = stoneDesigns.filter((design) => {
      const steps = stoneCarves.filter((carve) => carve.designId === design.id);
      return design.adopted && steps.length > 0 && steps.every((step) => step.state === 'done');
    }).length;
    const lastActivityAt = Math.max(
      ...stoneDesigns.map((design) => design.updatedAt),
      0,
    );
    result[stone.id] = {
      stoneId: stone.id,
      carvedCount,
      designCount: stoneDesigns.length,
      idleDays: idleDays(stone, lastActivityAt),
      lastStampedAt: stoneImpressions[stoneImpressions.length - 1]?.stampedAt ?? '',
      catalogIncluded: catalogs.filter(
        (catalog) => catalog.stoneId === stone.id && catalog.included === 'included',
      ).length,
    };
  });
  return result;
}
