/**
 * 钤印记录（Impression）数据模型
 * 同一印稿的多次钤印：印泥、纸张、压力与效果评级，可择优回填。
 */

/** 纸张：连史纸 / 宣纸 / 罗纹纸 */
export type PaperKind = 'lianshi' | 'xuan' | 'luowen';

/** 压力：轻 / 中 / 重 */
export type Pressure = 'light' | 'medium' | 'heavy';

/** 效果评级：优 / 良 / 一般 / 废 */
export type Grade = 'excellent' | 'good' | 'fair' | 'waste';

export interface Impression {
  id: string;
  /** 所属印稿 id */
  designId: string;
  /** 印泥品牌 */
  inkBrand: string;
  /** 纸张 */
  paperType: PaperKind;
  /** 压力 */
  pressure: Pressure;
  /** 效果评级 */
  grade: Grade;
  /** 钤印日期 yyyy-MM-dd */
  stampedAt: string;
  /** 备注（是否采用稿效果等） */
  note: string;
  createdAt: number;
  updatedAt: number;
}

export type ImpressionDraft = Omit<Impression, 'id' | 'createdAt' | 'updatedAt'>;

export const GRADE_LABEL: Record<Grade, string> = {
  excellent: '优',
  good: '良',
  fair: '一般',
  waste: '废',
};

export const GRADE_COLOR: Record<Grade, string> = {
  excellent: '#9c2b1f',
  good: '#b98a3c',
  fair: '#3f6b57',
  waste: '#8b8f90',
};

/** 图标（字符形式，避免引入图标库） */
export const GRADE_ICON: Record<Grade, string> = {
  excellent: '★',
  good: '☆',
  fair: '○',
  waste: '×',
};

export const GRADE_OPTIONS: ReadonlyArray<{ value: Grade; label: string }> = [
  { value: 'excellent', label: '优' },
  { value: 'good', label: '良' },
  { value: 'fair', label: '一般' },
  { value: 'waste', label: '废' },
];

/** 评级排序权重：优 > 良 > 一般 > 废 */
export const GRADE_WEIGHT: Record<Grade, number> = {
  excellent: 4,
  good: 3,
  fair: 2,
  waste: 1,
};

export const PAPER_KIND_LABEL: Record<PaperKind, string> = {
  lianshi: '连史纸',
  xuan: '宣纸',
  luowen: '罗纹纸',
};

export const PAPER_KIND_OPTIONS: ReadonlyArray<{ value: PaperKind; label: string }> = [
  { value: 'lianshi', label: '连史纸' },
  { value: 'xuan', label: '宣纸' },
  { value: 'luowen', label: '罗纹纸' },
];

export const PRESSURE_LABEL: Record<Pressure, string> = {
  light: '轻',
  medium: '中',
  heavy: '重',
};

export const PRESSURE_OPTIONS: ReadonlyArray<{ value: Pressure; label: string }> = [
  { value: 'light', label: '轻' },
  { value: 'medium', label: '中' },
  { value: 'heavy', label: '重' },
];

export const INK_BRAND_OPTIONS: readonly string[] = ['西泠印泥', '漳州八宝', '苏州姜思序堂', '自制朱磦', '日本吴竹'];

export function createEmptyImpressionDraft(designId: string): ImpressionDraft {
  return {
    designId,
    inkBrand: '西泠印泥',
    paperType: 'lianshi',
    pressure: 'medium',
    grade: 'good',
    stampedAt: new Date().toISOString().slice(0, 10),
    note: '',
  };
}
