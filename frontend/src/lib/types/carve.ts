/**
 * 刻制工序（Carve）数据模型
 * 按刀法排布的刻制步骤，全部完成即回写印稿为已刻。
 */

/** 刀法：冲刀 / 切刀 / 双刀 / 修整 */
export type KnifeMethod = 'chong' | 'qie' | 'double' | 'trim';

/** 工序状态：未开始 / 进行中 / 已完成 */
export type CarveState = 'todo' | 'doing' | 'done';

export interface Carve {
  id: string;
  /** 所属印稿 id */
  designId: string;
  /** 工序序号，从 1 开始连续整数 */
  seq: number;
  /** 刀法 */
  knifeMethod: KnifeMethod;
  /** 时长（分钟） */
  minutes: number;
  /** 执刀人 */
  operator: string;
  /** 工序状态 */
  state: CarveState;
  createdAt: number;
  updatedAt: number;
}

export type CarveDraft = Omit<Carve, 'id' | 'createdAt' | 'updatedAt'>;

export const KNIFE_METHOD_LABEL: Record<KnifeMethod, string> = {
  chong: '冲刀',
  qie: '切刀',
  double: '双刀',
  trim: '修整',
};

export const KNIFE_METHOD_COLOR: Record<KnifeMethod, string> = {
  chong: '#9c2b1f',
  qie: '#b98a3c',
  double: '#3f6b57',
  trim: '#4c5254',
};

export const KNIFE_METHOD_OPTIONS: ReadonlyArray<{ value: KnifeMethod; label: string }> = [
  { value: 'chong', label: '冲刀' },
  { value: 'qie', label: '切刀' },
  { value: 'double', label: '双刀' },
  { value: 'trim', label: '修整' },
];

export const CARVE_STATE_LABEL: Record<CarveState, string> = {
  todo: '未开始',
  doing: '进行中',
  done: '已完成',
};

export const CARVE_STATE_COLOR: Record<CarveState, string> = {
  todo: '#8b8f90',
  doing: '#b98a3c',
  done: '#3f6b57',
};

export const CARVE_STATE_OPTIONS: ReadonlyArray<{ value: CarveState; label: string }> = [
  { value: 'todo', label: '未开始' },
  { value: 'doing', label: '进行中' },
  { value: 'done', label: '已完成' },
];

export const CARVE_STATE_FLOW: readonly CarveState[] = ['todo', 'doing', 'done'];

export function nextCarveState(state: CarveState): CarveState {
  const index = CARVE_STATE_FLOW.indexOf(state);
  if (index < 0 || index >= CARVE_STATE_FLOW.length - 1) return state;
  return CARVE_STATE_FLOW[index + 1] as CarveState;
}

/** 标准刻制序列：起稿修边 → 冲刀主线 → 切刀收拾 → 修整完稿 */
export const STANDARD_KNIFE_SEQUENCE: readonly KnifeMethod[] = ['chong', 'qie', 'double', 'trim'];

export function suggestMinutes(method: KnifeMethod): number {
  if (method === 'chong') return 40;
  if (method === 'qie') return 30;
  if (method === 'double') return 25;
  return 15;
}

export function createEmptyCarveDraft(designId: string, seq: number): CarveDraft {
  const method = STANDARD_KNIFE_SEQUENCE[Math.min(seq - 1, STANDARD_KNIFE_SEQUENCE.length - 1)] ?? 'chong';
  return {
    designId,
    seq,
    knifeMethod: method,
    minutes: suggestMinutes(method),
    operator: '',
    state: 'todo',
  };
}
