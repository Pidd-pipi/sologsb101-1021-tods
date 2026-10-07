/**
 * useIdbTable：Dexie 单表增删改查 + Svelte store 响应式订阅封装
 * 页面统一通过它读写 IndexedDB（印谱条目、钤印明细等页面级只读订阅）。
 */
import { liveQuery } from 'dexie';
import type { Table } from 'dexie';
import { onDestroy } from 'svelte';
import { writable, type Readable } from 'svelte/store';
import { createId, db } from '$lib/utils/db';

export type IdbRecord = { id: string; createdAt?: number; updatedAt?: number };

export type NewRecord<T extends IdbRecord> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
};

export interface UseIdbTableOptions {
  /** 是否按 updatedAt 倒序，默认 true */
  sortByUpdatedAt?: boolean;
}

export interface UseIdbTableResult<T extends IdbRecord> {
  /** 响应式行集合 */
  rows: Readable<T[]>;
  loading: Readable<boolean>;
  /** 是否完成首次载入：用于区分「数据为空」与「尚未读取」 */
  ready: Readable<boolean>;
  error: Readable<string>;
  refresh: () => Promise<void>;
  stop: () => void;
  getById: (id: string) => Promise<T | undefined>;
  list: () => Promise<T[]>;
  create: (payload: NewRecord<T>, idPrefix?: string) => Promise<T>;
  update: (id: string, patch: Partial<T>) => Promise<void>;
  upsert: (row: T) => Promise<void>;
  remove: (id: string) => Promise<void>;
  bulkRemove: (ids: string[]) => Promise<void>;
  bulkPut: (rows: T[]) => Promise<void>;
  clear: () => Promise<void>;
}

export function useIdbTable<T extends IdbRecord>(
  tableSelector: (database: typeof db) => Table<T, string>,
  options: UseIdbTableOptions = {},
): UseIdbTableResult<T> {
  const { sortByUpdatedAt = true } = options;
  const table = tableSelector(db);

  const rows = writable<T[]>([]);
  const loading = writable(false);
  const ready = writable(false);
  const error = writable('');

  const applySort = (list: T[]): T[] =>
    sortByUpdatedAt ? [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)) : [...list];

  const refresh = async (): Promise<void> => {
    loading.set(true);
    try {
      rows.set(applySort(await table.toArray()));
      error.set('');
      ready.set(true);
    } catch (err) {
      error.set(err instanceof Error ? err.message : '读取本地数据失败');
    } finally {
      loading.set(false);
    }
  };

  const subscription = liveQuery(async () => applySort(await table.toArray())).subscribe({
    next: (list) => {
      rows.set(list);
      error.set('');
      ready.set(true);
    },
    error: (err: unknown) => {
      error.set(err instanceof Error ? err.message : '订阅本地数据失败');
    },
  });

  const stop = (): void => {
    subscription.unsubscribe();
  };

  void refresh();
  onDestroy(stop);

  return {
    rows,
    loading,
    ready,
    error,
    refresh,
    stop,
    getById: (id: string) => table.get(id),
    list: () => table.toArray(),
    create: async (payload, idPrefix = 'row') => {
      const now = Date.now();
      const record = {
        ...(payload as object),
        id: payload.id ?? createId(idPrefix),
        createdAt: payload.createdAt ?? now,
        updatedAt: payload.updatedAt ?? now,
      } as T;
      await table.put(record);
      return record;
    },
    update: async (id, patch) => {
      await table.update(id, { ...patch, updatedAt: Date.now() } as never);
    },
    upsert: async (row) => {
      await table.put({ ...row, updatedAt: Date.now() } as T);
    },
    remove: async (id) => {
      await table.delete(id);
    },
    bulkRemove: async (ids) => {
      await table.bulkDelete(ids);
    },
    bulkPut: async (list) => {
      await table.bulkPut(list);
    },
    clear: async () => {
      await table.clear();
    },
  };
}

export default useIdbTable;
