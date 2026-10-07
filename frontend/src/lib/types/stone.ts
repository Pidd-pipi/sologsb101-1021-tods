/**
 * 印石（Stone）数据模型
 * 一方印石的档案：石种、钮式、尺寸、购入日期与当前状态。
 */

/** 石种：寿山 / 青田 / 昌化 / 巴林 */
export type StoneType = 'shoushan' | 'qingtian' | 'changhua' | 'balin';

/** 钮式：平顶 / 桥钮 / 古兽 / 薄意 */
export type KnobStyle = 'flat' | 'bridge' | 'beast' | 'thin';

/** 状态：在刻 / 已刻 / 闲置 */
export type StoneState = 'carving' | 'carved' | 'idle';

export interface Stone {
  /** 主键，播种数据使用固定字符串便于互引 */
  id: string;
  /** 印石名 */
  name: string;
  /** 石种 */
  stoneType: StoneType;
  /** 长×宽×高（毫米），如 "25×25×60" */
  sizeMm: string;
  /** 钮式 */
  knobStyle: KnobStyle;
  /** 购入日期 yyyy-MM-dd */
  purchaseDate: string;
  /** 当前状态 */
  state: StoneState;
  createdAt: number;
  updatedAt: number;
}

export type StoneDraft = Omit<Stone, 'id' | 'createdAt' | 'updatedAt'>;

export const STONE_TYPE_LABEL: Record<StoneType, string> = {
  shoushan: '寿山',
  qingtian: '青田',
  changhua: '昌化',
  balin: '巴林',
};

export const STONE_TYPE_COLOR: Record<StoneType, string> = {
  shoushan: '#b98a3c',
  qingtian: '#3f6b57',
  changhua: '#9c2b1f',
  balin: '#4c5254',
};

export const KNOB_STYLE_LABEL: Record<KnobStyle, string> = {
  flat: '平顶',
  bridge: '桥钮',
  beast: '古兽',
  thin: '薄意',
};

export const STONE_STATE_LABEL: Record<StoneState, string> = {
  carving: '在刻',
  carved: '已刻',
  idle: '闲置',
};

export const STONE_STATE_COLOR: Record<StoneState, string> = {
  carving: '#b98a3c',
  carved: '#3f6b57',
  idle: '#8b8f90',
};

export const STONE_TYPE_OPTIONS: ReadonlyArray<{ value: StoneType; label: string }> = [
  { value: 'shoushan', label: '寿山' },
  { value: 'qingtian', label: '青田' },
  { value: 'changhua', label: '昌化' },
  { value: 'balin', label: '巴林' },
];

export const KNOB_STYLE_OPTIONS: ReadonlyArray<{ value: KnobStyle; label: string }> = [
  { value: 'flat', label: '平顶' },
  { value: 'bridge', label: '桥钮' },
  { value: 'beast', label: '古兽' },
  { value: 'thin', label: '薄意' },
];

export const STONE_STATE_OPTIONS: ReadonlyArray<{ value: StoneState; label: string }> = [
  { value: 'carving', label: '在刻' },
  { value: 'carved', label: '已刻' },
  { value: 'idle', label: '闲置' },
];

export const STONE_STATE_FLOW: readonly StoneState[] = ['carving', 'carved', 'idle'];

export function nextStoneState(state: StoneState): StoneState {
  const index = STONE_STATE_FLOW.indexOf(state);
  if (index < 0 || index >= STONE_STATE_FLOW.length - 1) return state;
  return STONE_STATE_FLOW[index + 1] as StoneState;
}

export function createEmptyStoneDraft(): StoneDraft {
  return {
    name: '',
    stoneType: 'shoushan',
    sizeMm: '25×25×60',
    knobStyle: 'flat',
    purchaseDate: new Date().toISOString().slice(0, 10),
    state: 'carving',
  };
}

/** 印石台账的派生统计（已刻方数、闲置天数、最近钤印日期） */
export interface StoneStat {
  stoneId: string;
  /** 该石已刻方数（已采用稿且工序完成的印稿数） */
  carvedCount: number;
  /** 印稿总数 */
  designCount: number;
  /** 闲置天数（未产生印稿的时间） */
  idleDays: number;
  /** 最近钤印日期 */
  lastStampedAt: string;
  /** 印谱收录方数 */
  catalogIncluded: number;
}
