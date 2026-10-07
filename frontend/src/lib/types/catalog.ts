/**
 * 印谱条目（Catalog）数据模型
 * 印谱的排序与收录状态；调整排序后自动重编号。
 */

/** 收录状态：待收录 / 已收录 / 不收录 */
export type IncludedStatus = 'pending' | 'included' | 'excluded';

export interface Catalog {
  id: string;
  /** 所属印石 id */
  stoneId: string;
  /** 对应印稿 id */
  designId: string;
  /** 排序号，从 1 开始连续整数 */
  orderNo: number;
  /** 收录状态 */
  included: IncludedStatus;
  /** 备注 */
  note: string;
  createdAt: number;
  updatedAt: number;
}

export type CatalogDraft = Omit<Catalog, 'id' | 'createdAt' | 'updatedAt'>;

export const INCLUDED_LABEL: Record<IncludedStatus, string> = {
  pending: '待收录',
  included: '已收录',
  excluded: '不收录',
};

export const INCLUDED_COLOR: Record<IncludedStatus, string> = {
  pending: '#8b8f90',
  included: '#3f6b57',
  excluded: '#9c2b1f',
};

export const INCLUDED_OPTIONS: ReadonlyArray<{ value: IncludedStatus; label: string }> = [
  { value: 'pending', label: '待收录' },
  { value: 'included', label: '已收录' },
  { value: 'excluded', label: '不收录' },
];

export function createEmptyCatalogDraft(stoneId: string, designId: string, orderNo: number): CatalogDraft {
  return {
    stoneId,
    designId,
    orderNo,
    included: 'pending',
    note: '',
  };
}
