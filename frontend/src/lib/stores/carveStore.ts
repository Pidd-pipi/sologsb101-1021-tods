/**
 * 刻制工序 store（Svelte writable / derived）
 * 维护工序顺序与完成计数；全部完成即回写印稿为已刻（印石状态置为「已刻」）。
 */
import { derived, get, writable } from 'svelte/store';
import { createId, db } from '$lib/utils/db';
import {
  nextCarveState,
  suggestMinutes,
  STANDARD_KNIFE_SEQUENCE,
  type Carve,
  type CarveDraft,
  type CarveState,
  type KnifeMethod,
} from '$lib/types/carve';
import { designById, updateDesign } from './designStore';
import { updateStone } from './stoneStore';

export const carves = writable<Carve[]>([]);
export const carveLoading = writable(false);
export const carveReady = writable(false);
export const carveError = writable('');

export const carveTotals = derived(carves, ($carves) => {
  const done = $carves.filter((carve) => carve.state === 'done').length;
  const doing = $carves.filter((carve) => carve.state === 'doing').length;
  const remainingMinutes = $carves
    .filter((carve) => carve.state !== 'done')
    .reduce((sum, carve) => sum + carve.minutes, 0);
  return {
    total: $carves.length,
    done,
    doing,
    remainingMinutes,
    percent: $carves.length === 0 ? 0 : Math.round((done / $carves.length) * 100),
  };
});

export async function loadCarves(): Promise<void> {
  carveLoading.set(true);
  try {
    const rows = await db.carves.toArray();
    rows.sort((a, b) => (a.designId === b.designId ? a.seq - b.seq : a.designId.localeCompare(b.designId)));
    carves.set(rows);
    carveError.set('');
    carveReady.set(true);
  } catch (err) {
    carveError.set(err instanceof Error ? err.message : '工序读取失败');
    carveReady.set(true);
  } finally {
    carveLoading.set(false);
  }
}

export function carvesOfDesign(designId: string): Carve[] {
  return get(carves)
    .filter((carve) => carve.designId === designId)
    .sort((a, b) => a.seq - b.seq);
}

export function nextSeq(designId: string): number {
  const list = carvesOfDesign(designId);
  return list.length === 0 ? 1 : Math.max(...list.map((carve) => carve.seq)) + 1;
}

export async function createCarve(draft: CarveDraft): Promise<Carve> {
  const now = Date.now();
  const row: Carve = { ...draft, id: createId('carve'), createdAt: now, updatedAt: now };
  await db.carves.put(row);
  await loadCarves();
  return row;
}

export async function updateCarve(id: string, patch: Partial<Carve>): Promise<void> {
  await db.carves.update(id, { ...patch, updatedAt: Date.now() } as never);
  await loadCarves();
}

export async function removeCarve(id: string): Promise<void> {
  const target = get(carves).find((carve) => carve.id === id);
  await db.carves.delete(id);
  if (target) {
    const rest = carvesOfDesign(target.designId)
      .filter((carve) => carve.id !== id)
      .map((carve, index) => ({ ...carve, seq: index + 1, updatedAt: Date.now() }));
    if (rest.length > 0) await db.carves.bulkPut(rest);
  }
  await loadCarves();
}

export async function reorderCarves(designId: string, orderedIds: string[]): Promise<void> {
  const indexOf = new Map(orderedIds.map((id, index) => [id, index]));
  const rows = carvesOfDesign(designId)
    .sort((a, b) => {
      const ai = indexOf.has(a.id) ? (indexOf.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
      const bi = indexOf.has(b.id) ? (indexOf.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    })
    .map((carve, index) => ({ ...carve, seq: index + 1, updatedAt: Date.now() }));
  await db.carves.bulkPut(rows);
  await loadCarves();
}

export async function batchUpdateCarves(ids: string[], patch: Partial<Carve>): Promise<void> {
  if (ids.length === 0) return;
  const now = Date.now();
  const rows = get(carves)
    .filter((carve) => ids.includes(carve.id))
    .map((carve) => ({ ...carve, ...patch, updatedAt: now }));
  await db.carves.bulkPut(rows);
  await loadCarves();
}

/**
 * 推进工序状态；某印稿全部工序完成时回写印石状态为「已刻」。
 * 返回推进后的状态，便于页面提示。
 */
export async function advanceCarve(id: string): Promise<CarveState> {
  const carve = get(carves).find((item) => item.id === id);
  if (!carve) return 'todo';
  const next = nextCarveState(carve.state);
  if (next === carve.state) return carve.state;
  await updateCarve(id, { state: next });

  const designId = carve.designId;
  const steps = carvesOfDesign(designId);
  const allDone = steps.length > 0 && steps.every((step) => step.state === 'done');
  if (allDone) {
    const design = designById(designId);
    if (design) {
      await updateDesign(designId, {});
      await updateStone(design.stoneId, { state: 'carved' });
    }
  }
  return next;
}

/** 按标准刀法序列生成工序（已存在的序号跳过） */
export async function generateStandardSequence(designId: string): Promise<number> {
  const existing = carvesOfDesign(designId);
  const now = Date.now();
  let created = 0;
  for (let index = 0; index < STANDARD_KNIFE_SEQUENCE.length; index += 1) {
    const seq = index + 1;
    if (existing.some((carve) => carve.seq === seq)) continue;
    const method = STANDARD_KNIFE_SEQUENCE[index] as KnifeMethod;
    await db.carves.put({
      id: createId('carve'),
      designId,
      seq,
      knifeMethod: method,
      minutes: suggestMinutes(method),
      operator: '',
      state: 'todo',
      createdAt: now,
      updatedAt: now,
    });
    created += 1;
  }
  await loadCarves();
  return created;
}
