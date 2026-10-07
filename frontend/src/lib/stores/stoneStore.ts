/**
 * 印石 store（Svelte writable / derived）
 * 维护印石列表、当前选中印石与筛选条件；跨页状态不留在组件内部。
 */
import { derived, get, writable } from 'svelte/store';
import { createId, db, readUiPrefs, removeStoneCascade, writeUiPrefs } from '$lib/utils/db';
import {
  nextStoneState,
  type KnobStyle,
  type Stone,
  type StoneDraft,
  type StoneState,
  type StoneType,
} from '$lib/types/stone';
import { sortByPurchaseDate } from '$lib/utils/stone';

export interface StoneFilters {
  keyword: string;
  stoneTypes: StoneType[];
  knobStyles: KnobStyle[];
}

export const DEFAULT_STONE_FILTERS: StoneFilters = { keyword: '', stoneTypes: [], knobStyles: [] };

const prefs = readUiPrefs();

export const stones = writable<Stone[]>([]);
export const stoneLoading = writable(false);
export const stoneReady = writable(false);
export const stoneError = writable('');
export const currentStoneId = writable<string | null>(prefs.lastStoneId);
export const stoneFilters = writable<StoneFilters>({ ...DEFAULT_STONE_FILTERS });

currentStoneId.subscribe((value) => {
  writeUiPrefs({ ...readUiPrefs(), lastStoneId: value });
});

/** 按采购日期升序的印石列表 */
export const sortedStones = derived(stones, ($stones) => sortByPurchaseDate($stones));

/** 派生选择器：关键字 + 石种 + 钮式过滤 */
export const filteredStones = derived([stones, stoneFilters], ([$stones, $filters]) => {
  const keyword = $filters.keyword.trim();
  return sortByPurchaseDate($stones).filter((stone) => {
    if (keyword.length > 0) {
      const haystack = `${stone.name}${stone.sizeMm}${stone.purchaseDate}`;
      if (!haystack.includes(keyword)) return false;
    }
    if ($filters.stoneTypes.length > 0 && !$filters.stoneTypes.includes(stone.stoneType)) return false;
    if ($filters.knobStyles.length > 0 && !$filters.knobStyles.includes(stone.knobStyle)) return false;
    return true;
  });
});

export const currentStone = derived([stones, currentStoneId], ([$stones, $id]) => {
  return $stones.find((stone) => stone.id === $id) ?? null;
});

export async function loadStones(): Promise<void> {
  stoneLoading.set(true);
  try {
    const rows = await db.stones.toArray();
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    stones.set(rows);
    stoneError.set('');
    stoneReady.set(true);
    const current = get(currentStoneId);
    if (current !== null && !rows.some((stone) => stone.id === current)) currentStoneId.set(null);
  } catch (err) {
    stoneError.set(err instanceof Error ? err.message : '印石读取失败');
    stoneReady.set(true);
  } finally {
    stoneLoading.set(false);
  }
}

export function setCurrentStone(id: string | null): void {
  currentStoneId.set(id);
}

export function setStoneKeyword(keyword: string): void {
  stoneFilters.update((filters) => ({ ...filters, keyword }));
}

export function setStoneTypes(stoneTypes: StoneType[]): void {
  stoneFilters.update((filters) => ({ ...filters, stoneTypes }));
}

export function setKnobStyles(knobStyles: KnobStyle[]): void {
  stoneFilters.update((filters) => ({ ...filters, knobStyles }));
}

export function resetStoneFilters(): void {
  stoneFilters.set({ ...DEFAULT_STONE_FILTERS });
}

export async function createStone(draft: StoneDraft): Promise<Stone> {
  const now = Date.now();
  const row: Stone = { ...draft, id: createId('stone'), createdAt: now, updatedAt: now };
  await db.stones.put(row);
  await loadStones();
  currentStoneId.set(row.id);
  return row;
}

export async function updateStone(id: string, patch: Partial<Stone>): Promise<void> {
  await db.stones.update(id, { ...patch, updatedAt: Date.now() } as never);
  await loadStones();
}

export async function removeStone(id: string): Promise<void> {
  await removeStoneCascade(id);
  if (get(currentStoneId) === id) currentStoneId.set(null);
  await loadStones();
}

export async function advanceStoneState(id: string): Promise<void> {
  const stone = get(stones).find((item) => item.id === id);
  if (!stone) return;
  const next: StoneState = nextStoneState(stone.state);
  if (next === stone.state) return;
  await updateStone(id, { state: next });
}

export function stoneById(id: string): Stone | undefined {
  return get(stones).find((stone) => stone.id === id);
}
