/**
 * 导出工具：印谱 JSON 序列化与校验、印谱清单文本、钤印台账 CSV
 * 全部在浏览器本地完成，不经过任何服务端。
 */
import type { Stone } from '$lib/types/stone';
import type { Design } from '$lib/types/design';
import type { Impression } from '$lib/types/impression';
import type { Catalog } from '$lib/types/catalog';
import type { Carve } from '$lib/types/carve';
import { STONE_TYPE_LABEL, KNOB_STYLE_LABEL } from '$lib/types/stone';
import { DESIGN_STYLE_LABEL, BORDER_STYLE_LABEL } from '$lib/types/design';
import { GRADE_LABEL, PAPER_KIND_LABEL, PRESSURE_LABEL } from '$lib/types/impression';
import { INCLUDED_LABEL } from '$lib/types/catalog';
import { KNIFE_METHOD_LABEL, CARVE_STATE_LABEL } from '$lib/types/carve';
import { describeSize } from './stone';
import type { SealCarveSnapshot } from './db';

/** 触发浏览器下载 */
export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function stampSuffix(): string {
  const date = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** 印谱 JSON 序列化（结构版本号 + 五张表全量），返回文件名 */
export function exportSnapshotJson(snapshot: SealCarveSnapshot): string {
  const filename = `gbsealcarve-backup-${stampSuffix()}.json`;
  download(filename, JSON.stringify(snapshot, null, 2), 'application/json;charset=utf-8');
  return filename;
}

/** 印谱 JSON 校验：检查 app 标识与各集合数组完整性 */
export function validateSnapshot(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '文件内容不是合法的 JSON 对象';
  const snapshot = input as Partial<SealCarveSnapshot>;
  if (snapshot.app !== 'gbsealcarve') return `备份文件不属于本项目（app=${String(snapshot.app)}）`;
  const keys: Array<keyof SealCarveSnapshot> = ['stones', 'designs', 'carves', 'impressions', 'catalogs'];
  for (const key of keys) {
    if (!Array.isArray(snapshot[key])) return `备份文件缺少 ${String(key)} 集合`;
  }
  return '';
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface SealCatalogContext {
  stones: Stone[];
  designs: Design[];
  carves: Carve[];
  impressions: Impression[];
  catalogs: Catalog[];
}

/** 印谱清单文本：按印谱排序号展开，附印石、印文、释文、工序与最佳钤印 */
export function buildCatalogText(context: SealCatalogContext): string {
  const { stones, designs, carves, impressions, catalogs } = context;
  const lines: string[] = ['篆刻印谱清单', `生成时间：${new Date().toLocaleString('zh-CN')}`, ''];
  const sorted = [...catalogs].sort((a, b) => a.orderNo - b.orderNo);
  if (sorted.length === 0) {
    lines.push('印谱尚无条目。');
    return lines.join('\n');
  }
  sorted.forEach((catalog) => {
    const stone = stones.find((item) => item.id === catalog.stoneId);
    const design = designs.find((item) => item.id === catalog.designId);
    const steps = carves.filter((carve) => carve.designId === catalog.designId).sort((a, b) => a.seq - b.seq);
    const prints = impressions
      .filter((impression) => impression.designId === catalog.designId)
      .sort((a, b) => b.stampedAt.localeCompare(a.stampedAt));
    const best = [...prints].sort((a, b) => gradeWeight(b.grade) - gradeWeight(a.grade))[0];
    lines.push(`第 ${catalog.orderNo} 方　${INCLUDED_LABEL[catalog.included]}`);
    lines.push(
      `　印文：${design?.sealText ?? '（印稿已删除）'}　释文：${design?.annotation ?? '无'}`,
    );
    lines.push(
      `　形制：${design ? `${DESIGN_STYLE_LABEL[design.style]}·${BORDER_STYLE_LABEL[design.borderStyle]}` : '未知'}　章法：${design?.layoutNote || '无'}`,
    );
    lines.push(
      `　印石：${stone?.name ?? '（印石已删除）'}　${stone ? `${STONE_TYPE_LABEL[stone.stoneType]}·${KNOB_STYLE_LABEL[stone.knobStyle]}` : ''}　${
        stone ? describeSize(stone.sizeMm) : ''
      }`,
    );
    lines.push(
      `　工序：${steps.length === 0 ? '未排工序' : steps.map((step) => `${step.seq}.${KNIFE_METHOD_LABEL[step.knifeMethod]}(${CARVE_STATE_LABEL[step.state]})`).join(' → ')}`,
    );
    lines.push(
      `　钤印：${prints.length} 次${best ? `　最佳评级：${GRADE_LABEL[best.grade]}（${best.stampedAt}　${best.inkBrand}／${PAPER_KIND_LABEL[best.paperType]}／${PRESSURE_LABEL[best.pressure]}）` : ''}`,
    );
    if (catalog.note) lines.push(`　备注：${catalog.note}`);
    lines.push('');
  });
  const included = sorted.filter((item) => item.included === 'included').length;
  lines.push(`合计 ${sorted.length} 方，其中已收录 ${included} 方。`);
  return lines.join('\n');
}

function gradeWeight(grade: string): number {
  if (grade === 'excellent') return 4;
  if (grade === 'good') return 3;
  if (grade === 'fair') return 2;
  return 1;
}

/** 导出印谱清单为文本文件 */
export function exportCatalogText(context: SealCatalogContext): string {
  const filename = `篆刻印谱清单-${stampSuffix()}.txt`;
  download(filename, buildCatalogText(context), 'text/plain;charset=utf-8');
  return filename;
}

/** 钤印台账 CSV */
export function exportImpressionCsv(context: SealCatalogContext): string {
  const header = ['印文', '印石', '印泥', '纸张', '压力', '评级', '钤印日期', '备注'];
  const lines: string[] = [header.map(csvCell).join(',')];
  context.impressions
    .slice()
    .sort((a, b) => a.stampedAt.localeCompare(b.stampedAt))
    .forEach((impression) => {
      const design = context.designs.find((item) => item.id === impression.designId);
      const stone = context.stones.find((item) => item.id === design?.stoneId);
      lines.push(
        [
          design?.sealText ?? '（印稿已删除）',
          stone?.name ?? '—',
          impression.inkBrand,
          PAPER_KIND_LABEL[impression.paperType],
          PRESSURE_LABEL[impression.pressure],
          GRADE_LABEL[impression.grade],
          impression.stampedAt,
          impression.note,
        ]
          .map(csvCell)
          .join(','),
      );
    });
  const filename = `篆刻钤印台账-${stampSuffix()}.csv`;
  download(filename, `\uFEFF${lines.join('\n')}`, 'text/csv;charset=utf-8');
  return filename;
}

/** 复制文本到剪贴板 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
