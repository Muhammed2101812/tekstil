import { create } from 'zustand';
import {
  AttendanceDay,
  AttendanceRecord,
  CalendarEvent,
  Debt,
  Department,
  Employee,
  EmployeeSalary,
  LeaveAdjustment,
  Organization,
  OrgMember,
  OvertimeRecord,
  Payroll,
  PayrollItem,
  ProductionBatch,
  SalaryPayment,
  ScheduleDay,
} from '../types';

/**
 * Bellek içi veri önbelleği (agent.md: uygulama tamamen online çalışır).
 * - Store yalnızca Supabase'ten çekilen / başarılı yazmaların aynasını tutar.
 * - Kalıcılık YOKTUR: uygulama kapanınca içerik gider, açılışta pullAll doldurur.
 * - Yazma kuralı: hiçbir satır doğrudan buraya yazılmaz; remoteUpsert/remoteDelete
 *   (src/data/supabase.ts) başarılı sunucu işleminden sonra bu store'u günceller.
 */

export interface DataDB {
  organizations: Organization[];
  org_members: OrgMember[];
  departments: Department[];
  schedule_days: ScheduleDay[];
  calendar_events: CalendarEvent[];
  employees: Employee[];
  employee_salaries: EmployeeSalary[];
  attendance: AttendanceRecord[];
  attendance_days: AttendanceDay[];
  overtime: OvertimeRecord[];
  debts: Debt[];
  debt_payments: import('../types').DebtPayment[];
  leave_adjustments: LeaveAdjustment[];
  payrolls: Payroll[];
  payroll_items: PayrollItem[];
  salary_payments: SalaryPayment[];
  production_batches: ProductionBatch[];
}

export function emptyDB(): DataDB {
  return {
    organizations: [],
    org_members: [],
    departments: [],
    schedule_days: [],
    calendar_events: [],
    employees: [],
    employee_salaries: [],
    attendance: [],
    attendance_days: [],
    overtime: [],
    debts: [],
    debt_payments: [],
    leave_adjustments: [],
    payrolls: [],
    payroll_items: [],
    salary_payments: [],
    production_batches: [],
  };
}

type TableName = keyof DataDB;

interface DataState {
  db: DataDB;
  orgId: string | null;
  userId: string | null;
  loaded: boolean;

  init: (userId: string, orgId: string | null) => void;
  setOrg: (orgId: string | null) => void;
  /** Giriş/oturum sonrası gerçek kullanıcıyı bağlar ('anon' başlangıcının yerine) */
  setUserId: (userId: string) => void;
  replaceDB: (db: DataDB) => void;

  /** Yalnız bellek günceller — doğrudan çağrılmaz, remoteUpsert kullanır */
  upsert<T extends TableName>(table: T, rows: DataDB[T] | DataDB[T][number]): void;
  /** Yalnız bellek günceller — doğrudan çağrılmaz, remoteDelete kullanır */
  remove(table: TableName, ids: string[]): void;
}

export const useDataStore = create<DataState>((set, get) => ({
  db: emptyDB(),
  orgId: null,
  userId: null,
  loaded: false,

  init: (_userId, _orgId) => {
    // Bellek içi önbellek: her açılışta boş başlar, pullAll doldurur.
    set({ userId: _userId, orgId: _orgId, loaded: true });
  },

  setOrg: (orgId) => set({ orgId }),

  setUserId: (userId) => set({ userId }),

  replaceDB: (db) => set({ db }),

  upsert: (table, rows) => {
    const incoming = (Array.isArray(rows) ? rows : [rows]) as unknown as { id: string }[];
    const db = { ...get().db } as DataDB;
    const currentList = [...(db[table] as unknown as { id: string }[])];
    for (const row of incoming) {
      const idx = currentList.findIndex((r) => r.id === row.id);
      if (idx >= 0) currentList[idx] = row;
      else currentList.push(row);
    }
    (db[table] as unknown) = currentList;
    set({ db });
  },

  remove: (table, ids) => {
    const db = { ...get().db } as DataDB;
    (db[table] as unknown) = (db[table] as unknown as { id: string }[]).filter((r) => !ids.includes(r.id));
    set({ db });
  },
}));

// ─── Senkron durumu (offline kuyruk yok; yalnız bayraklar) ──────────────────

interface SyncStatusState {
  online: boolean;
  lastError: string | null;
  /** İlk senkron tamamlandı mı? (kurulum sihirbazına yanlış yönlendirmeyi önler) */
  firstSyncDone: boolean;
  /** İlk senkron başarısızsa (offline vb.) hata ekranı gösterilir */
  initialSyncError: boolean;
  /** DataProvider'ın sync tetikleyicisi — hata ekranındaki "Tekrar Dene" çağırır */
  triggerSync: (() => void) | null;
  setOnline: (v: boolean) => void;
  setLastError: (err: string | null) => void;
  setFirstSyncDone: (v: boolean) => void;
  setInitialSyncError: (v: boolean) => void;
  setTriggerSync: (fn: (() => void) | null) => void;
  reset: () => void;
}

export const useSyncState = create<SyncStatusState>((set) => ({
  online: true,
  lastError: null,
  firstSyncDone: false,
  initialSyncError: false,
  triggerSync: null,
  setOnline: (v) => set({ online: v }),
  setLastError: (err) => set({ lastError: err }),
  setFirstSyncDone: (v) => set({ firstSyncDone: v }),
  setInitialSyncError: (v) => set({ initialSyncError: v }),
  setTriggerSync: (fn) => set({ triggerSync: fn }),
  reset: () =>
    set({ online: true, lastError: null, firstSyncDone: false, initialSyncError: false }),
}));
