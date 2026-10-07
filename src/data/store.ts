import { create } from 'zustand';
import { DataDB, emptyDB, PersistAdapter } from './persist';
import { QueuedOp } from './queue';

/**
 * Yerel veri deposu (offline-first, PLAN Bölüm 9):
 * - Her yazma önce yerel DB'ye uygulanır (iyimser güncelleme, <100 ms).
 * - Ardından senkron kuyruğuna eklenir; Supabase modunda bağlantı gelince
 *   id-aralıklı upsert ile gönderilir (çift kayıt oluşmaz).
 * - Okumalar doğrudan yerel DB'den yapılır (zustand seçicileri).
 */

type TableName = keyof DataDB;

interface DataState {
  db: DataDB;
  orgId: string | null;
  userId: string | null;
  persist: PersistAdapter | null;
  loaded: boolean;
  _saveTimer: ReturnType<typeof setTimeout> | null;

  init: (persist: PersistAdapter, userId: string, orgId: string | null) => Promise<void>;
  setOrg: (orgId: string | null) => void;
  setUserId: (userId: string) => void;
  replaceDB: (db: DataDB) => void;

  upsert<T extends TableName>(table: T, rows: DataDB[T] | DataDB[T][number], enqueue?: boolean): void;
  remove(table: TableName, ids: string[]): void;
}

export const useDataStore = create<DataState>((set, get) => {
  function scheduleSave() {
    const { persist, _saveTimer } = get();
    if (!persist) return;
    if (_saveTimer) clearTimeout(_saveTimer);
    const timer = setTimeout(() => {
      persist.saveDB(get().db).catch(() => undefined);
    }, 250);
    set({ _saveTimer: timer });
  }

  return {
    db: emptyDB(),
    orgId: null,
    userId: null,
    persist: null,
    loaded: false,
    _saveTimer: null,

    init: async (persist, userId, orgId) => {
      const db = (await persist.loadDB()) ?? emptyDB();
      set({ db, persist, userId, orgId, loaded: true });
    },

    setOrg: (orgId) => set({ orgId }),

    /** Giriş/oturum sonrası gerçek kullanıcıyı bağlar ('anon' başlangıcının yerine) */
    setUserId: (userId) => set({ userId }),

    replaceDB: (db) => {
      set({ db });
      scheduleSave();
    },

    upsert: (table, rows, enqueue = true) => {
      const incoming = (Array.isArray(rows) ? rows : [rows]) as unknown as { id: string }[];
      const db = { ...get().db } as DataDB;
      const currentList = [...(db[table] as unknown as { id: string }[])];
      for (const row of incoming) {
        const idx = currentList.findIndex((r) => r.id === row.id);
        if (idx >= 0) currentList[idx] = row; // son yazan kazanır (PLAN 8)
        else currentList.push(row);
      }
      (db[table] as unknown) = currentList;
      set({ db });
      scheduleSave();
      if (enqueue && get().userId) {
        for (const row of incoming) {
          useSyncQueue.getState().enqueue({ table, op: 'upsert', rowId: row.id });
        }
      }
    },

    remove: (table, ids) => {
      const db = { ...get().db } as DataDB;
      (db[table] as unknown) = (db[table] as unknown as { id: string }[]).filter((r) => !ids.includes(r.id));
      set({ db });
      scheduleSave();
      if (get().userId) {
        for (const id of ids) {
          useSyncQueue.getState().enqueue({ table, op: 'delete', rowId: id });
        }
      }
    },
  };
});

// ─── Senkron kuyruğu ─────────────────────────────────────────────────────────

interface SyncQueueState {
  pending: QueuedOp[];
  online: boolean;
  flushing: boolean;
  lastError: string | null;
  enqueue: (op: Omit<QueuedOp, 'id' | 'at'>) => void;
  setOnline: (v: boolean) => void;
  setPending: (ops: QueuedOp[]) => void;
  setFlushing: (v: boolean, err?: string | null) => void;
}

export const useSyncQueue = create<SyncQueueState>((set, get) => ({
  pending: [],
  online: true,
  flushing: false,
  lastError: null,
  enqueue: (op) => {
    const q = [...get().pending, { ...op, id: `${op.table}-${op.rowId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString() }];
    set({ pending: q });
    const persist = useDataStore.getState().persist;
    persist?.saveQueue(q).catch(() => undefined);
  },
  setOnline: (v) => set({ online: v }),
  setPending: (ops) => {
    set({ pending: ops });
    const persist = useDataStore.getState().persist;
    persist?.saveQueue(ops).catch(() => undefined);
  },
  setFlushing: (v, err = null) => set({ flushing: v, lastError: err }),
}));

export type { QueuedOp };
