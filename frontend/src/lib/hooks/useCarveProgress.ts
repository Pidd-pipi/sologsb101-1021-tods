/**
 * useCarveProgress()：派生某印稿的工序完成数、剩余时长与完成率
 * 被刻制看板（/carve）与印稿页（/designs）消费。
 */
import { derived, type Readable } from 'svelte/store';
import { carves } from '$lib/stores/carveStore';
import { impressions } from '$lib/stores/impressionStore';
import { GRADE_WEIGHT, GRADE_LABEL, type Grade } from '$lib/types/impression';
import type { DesignProgress } from '$lib/types/design';

export interface CarveProgressResult {
  /** 印稿 id → 工序进度 */
  progressByDesign: Readable<Record<string, DesignProgress>>;
  /** 全局汇总 */
  totals: Readable<{ total: number; done: number; doing: number; percent: number; remainingMinutes: number }>;
}

export function useCarveProgress(): CarveProgressResult {
  const progressByDesign = derived([carves, impressions], ([$carves, $impressions]) => {
    const result: Record<string, DesignProgress> = {};
    const designIds = new Set<string>([
      ...$carves.map((carve) => carve.designId),
      ...$impressions.map((impression) => impression.designId),
    ]);
    designIds.forEach((designId) => {
      const steps = $carves.filter((carve) => carve.designId === designId);
      const done = steps.filter((step) => step.state === 'done').length;
      const doing = steps.filter((step) => step.state === 'doing').length;
      const remainingMinutes = steps
        .filter((step) => step.state !== 'done')
        .reduce((sum, step) => sum + (Number.isFinite(step.minutes) ? step.minutes : 0), 0);
      const prints = $impressions.filter((impression) => impression.designId === designId);
      const best = [...prints].sort((a, b) => GRADE_WEIGHT[b.grade] - GRADE_WEIGHT[a.grade])[0];
      result[designId] = {
        designId,
        total: steps.length,
        done,
        doing,
        percent: steps.length === 0 ? 0 : Math.round((done / steps.length) * 100),
        remainingMinutes,
        bestGrade: best ? GRADE_LABEL[best.grade as Grade] : '未钤印',
        impressionCount: prints.length,
      };
    });
    return result;
  });

  const totals = derived(progressByDesign, ($map) => {
    const list = Object.values($map);
    const total = list.reduce((sum, item) => sum + item.total, 0);
    const done = list.reduce((sum, item) => sum + item.done, 0);
    const doing = list.reduce((sum, item) => sum + item.doing, 0);
    const remainingMinutes = list.reduce((sum, item) => sum + item.remainingMinutes, 0);
    return {
      total,
      done,
      doing,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
      remainingMinutes,
    };
  });

  return { progressByDesign, totals };
}

/** 从进度映射中安全取某印稿的进度 */
export function progressOfDesign(
  map: Record<string, DesignProgress>,
  designId: string,
): DesignProgress {
  return (
    map[designId] ?? {
      designId,
      total: 0,
      done: 0,
      doing: 0,
      percent: 0,
      remainingMinutes: 0,
      bestGrade: '未钤印',
      impressionCount: 0,
    }
  );
}

export default useCarveProgress;
