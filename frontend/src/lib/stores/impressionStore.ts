/**
 * 钤印 store（Svelte writable / derived）
 * 维护钤印记录与评级排序；可一键把最佳效果回填为采用稿效果。
 */
import { derived, get, writable } from 'svelte/store';
import { createId, db } from '$lib/utils/db';
import {
  GRADE_WEIGHT,
  type Grade,
  type Impression,
  type ImpressionDraft,
  type PaperKind,
} from '$lib/types/impression';
import { adoptDesign, designById, updateDesign } from './designStore';

export interface ImpressionFilters {
  keyword: string;
  grades: Grade[];
  paperTypes: PaperKind[];
}

export const DEFAULT_IMPRESSION_FILTERS: ImpressionFilters = {
  keyword: '',
  grades: [],
  paperTypes: [],
};

export const impressions = writable<Impression[]>([]);
export const impressionLoading = writable(false);
export const impressionReady = writable(false);
export const impressionError = writable('');
export const impressionFilters = writable<ImpressionFilters>({ ...DEFAULT_IMPRESSION_FILTERS });

/** 派生选择器：关键字 + 评级 + 纸张 */
export const filteredImpressions = derived(
  [impressions, impressionFilters],
  ([$impressions, $filters]) => {
    const keyword = $filters.keyword.trim();
    return $impressions.filter((impression) => {
      if (keyword.length > 0) {
        const haystack = `${impression.inkBrand}${impression.note}${impression.stampedAt}`;
        if (!haystack.includes(keyword)) return false;
      }
      if ($filters.grades.length > 0 && !$filters.grades.includes(impression.grade)) return false;
      if ($filters.paperTypes.length > 0 && !$filters.paperTypes.includes(impression.paperType)) return false;
      return true;
    });
  },
);

/** 按评级降序（同评级按日期倒序） */
export const gradeSortedImpressions = derived(impressions, ($impressions) =>
  [...$impressions].sort(
    (a, b) => GRADE_WEIGHT[b.grade] - GRADE_WEIGHT[a.grade] || b.stampedAt.localeCompare(a.stampedAt),
  ),
);

export async function loadImpressions(): Promise<void> {
  impressionLoading.set(true);
  try {
    const rows = await db.impressions.toArray();
    rows.sort((a, b) => b.stampedAt.localeCompare(a.stampedAt));
    impressions.set(rows);
    impressionError.set('');
    impressionReady.set(true);
  } catch (err) {
    impressionError.set(err instanceof Error ? err.message : '钤印记录读取失败');
    impressionReady.set(true);
  } finally {
    impressionLoading.set(false);
  }
}

export function impressionsOfDesign(designId: string): Impression[] {
  return get(impressions)
    .filter((impression) => impression.designId === designId)
    .sort((a, b) => GRADE_WEIGHT[b.grade] - GRADE_WEIGHT[a.grade] || b.stampedAt.localeCompare(a.stampedAt));
}

/** 某印稿的最佳钤印（评级最高，同日取最新） */
export function bestImpressionOf(designId: string): Impression | undefined {
  return impressionsOfDesign(designId)[0];
}

export function setImpressionKeyword(keyword: string): void {
  impressionFilters.update((filters) => ({ ...filters, keyword }));
}

export function setImpressionGrades(grades: Grade[]): void {
  impressionFilters.update((filters) => ({ ...filters, grades }));
}

export function setImpressionPaperTypes(paperTypes: PaperKind[]): void {
  impressionFilters.update((filters) => ({ ...filters, paperTypes }));
}

export function resetImpressionFilters(): void {
  impressionFilters.set({ ...DEFAULT_IMPRESSION_FILTERS });
}

export async function createImpression(draft: ImpressionDraft): Promise<Impression> {
  const now = Date.now();
  const row: Impression = { ...draft, id: createId('impr'), createdAt: now, updatedAt: now };
  await db.impressions.put(row);
  await loadImpressions();
  return row;
}

export async function updateImpression(id: string, patch: Partial<Impression>): Promise<void> {
  await db.impressions.update(id, { ...patch, updatedAt: Date.now() } as never);
  await loadImpressions();
}

export async function removeImpression(id: string): Promise<void> {
  await db.impressions.delete(id);
  await loadImpressions();
}

/**
 * 一键回填为采用稿效果：把该印稿评级最高的一条标记为采用效果，并把印稿置为采用稿。
 */
export async function applyBestAsAdopted(designId: string): Promise<Impression | undefined> {
  const best = bestImpressionOf(designId);
  if (!best) return undefined;
  const now = Date.now();
  const siblings = get(impressions).filter((impression) => impression.designId === designId);
  await db.impressions.bulkPut(
    siblings.map((impression) => ({
      ...impression,
      note: impression.id === best.id ? '采用稿效果' : impression.note.replace('采用稿效果', '').trim(),
      updatedAt: now,
    })),
  );
  const design = designById(designId);
  if (design) {
    await adoptDesign(designId);
  } else {
    await updateDesign(designId, { adopted: true });
  }
  await loadImpressions();
  return best;
}
