import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataDB } from './persist';
import { QueuedOp } from './queue';

/**
 * Supabase istemcisi. Uygulamada yalnızca `anon` anahtar bulunur; tüm yetki
 * RLS ile satır bazında verilir (PLAN Bölüm 8). Anahtarlar yoksa uygulama
 * "cihaz modunda" çalışır: veriler sadece telefonda tutulur.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

/** numeric alanlar Supabase'ten dizgi döner → number'a çevir (PLAN 5) */
const NUMERIC_FIELDS: Partial<Record<keyof DataDB, string[]>> = {
  employee_salaries: ['amount'],
  attendance: ['late_minutes', 'early_leave_minutes'],
  overtime: ['hours', 'multiplier'],
  debts: ['amount', 'installments'],
  debt_payments: ['amount'],
  leave_adjustments: ['days'],
  payroll_items: [
    'bonus', 'extra_cut', 'debt_override', 'base_salary', 'hourly_rate',
    'absence_cut', 'overtime_pay', 'debt_cut', 'net_payable', 'paid_amount',
  ],
  salary_payments: ['amount'],
  calendar_events: ['multiplier'],
  payrolls: [],
};

function toNumbers(table: keyof DataDB, row: Record<string, unknown>): Record<string, unknown> {
  const fields = NUMERIC_FIELDS[table];
  if (!fields) return row;
  const out = { ...row };
  for (const f of fields) {
    if (out[f] !== undefined && out[f] !== null && typeof out[f] === 'string') {
      out[f] = Number(out[f]);
    }
  }
  return out;
}

/** Kuyruğu Supabase'e boşaltır: id çakışmasında upsert → idempotent (PLAN 9) */
export async function flushQueue(ops: QueuedOp[]): Promise<{ ok: QueuedOp[]; failed: QueuedOp[] }> {
  const db = (await import('./store')).useDataStore.getState().db;
  const ok: QueuedOp[] = [];
  const failed: QueuedOp[] = [];

  // Tablo bazında grupla, tek istekte çok satır gönder
  const byTable = new Map<string, QueuedOp[]>();
  for (const op of ops) {
    const list = byTable.get(op.table) ?? [];
    list.push(op);
    byTable.set(op.table, list);
  }

  for (const [table, tableOps] of byTable) {
    const upserts = tableOps.filter((o) => o.op === 'upsert');
    const deletes = tableOps.filter((o) => o.op === 'delete');

    if (upserts.length) {
      const rows = upserts
        .map((o) => (db[o.table as keyof DataDB] as { id: string }[]).find((r) => r.id === o.rowId))
        .filter(Boolean) as Record<string, unknown>[];
      if (rows.length) {
        const { error } = await supabase.from(table).upsert(rows.map((r) => toNumbers(table as keyof DataDB, r)), {
          onConflict: 'id',
        });
        if (error) failed.push(...upserts);
        else ok.push(...upserts);
      } else {
        ok.push(...upserts); // satır yerelde yok — atlanabilir
      }
    }
    if (deletes.length) {
      const { error } = await supabase.from(table).delete().in('id', deletes.map((o) => o.rowId));
      if (error) failed.push(...deletes);
      else ok.push(...deletes);
    }
  }

  return { ok, failed };
}

/** Uzaktan değişen satırları çeker (updated_at > lastSync). Son yazan kazanır. */
const LAST_SYNC_KEY = 'tekstil:last-sync';

/**
 * Uzaktan gelen satırları yerel tabloyla birleştirir (id bazlı merge).
 * - Uzaktaki satır yerelde varsa: uzak kazanır (üzerine yazılır).
 * - Uzaktaki satır yerelde yoksa: listeye eklenir.
 * - Yerelde olup uzakta henüz olmayan satırlar (çevrimdışı yazılmış, kuyrukta bekleyen): KORUNUR.
 */
export function mergeRowsById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const merged = [...local];
  for (const r of remote) {
    const idx = merged.findIndex((l) => l.id === r.id);
    if (idx >= 0) merged[idx] = r;
    else merged.push(r);
  }
  return merged;
}

export async function pullAll(): Promise<{ pulled: number }> {
  const tables: (keyof DataDB)[] = [
    'organizations', 'org_members', 'org_invites', 'departments', 'schedule_days',
    'calendar_events', 'employees', 'employee_salaries', 'attendance', 'attendance_days',
    'overtime', 'debts', 'debt_payments', 'leave_adjustments', 'payrolls',
    'payroll_items', 'salary_payments',
  ];
  const { useDataStore } = await import('./store');
  let threshold = '1970-01-01T00:00:00Z';
  const hasLocalData = (useDataStore.getState().db.employees?.length ?? 0) > 0;
  if (hasLocalData) {
    try {
      const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
      if (raw) {
        const rawTime = new Date(raw).getTime();
        if (!Number.isNaN(rawTime)) {
          // Saat kayması payı: son başarılı senkrondan 5 dakika öncesi
          threshold = new Date(Math.max(0, rawTime - 5 * 60 * 1000)).toISOString();
        }
      }
    } catch {
      // yoksay
    }
  }

  let pulled = 0;
  const patch: Partial<DataDB> = {};
  const noUpdatedAtTables: (keyof DataDB)[] = [
    'organizations',
    'org_members',
    'org_invites',
    'employee_salaries',
    'attendance_days',
    'debt_payments',
    'leave_adjustments',
    'payrolls',
    'salary_payments',
  ];

  for (const table of tables) {
    if (noUpdatedAtTables.includes(table)) {
      // bu tablolarda updated_at yok — hepsini çek ve yerelle merge et
      const all = await supabase.from(table).select('*');
      if (!all.error && all.data) {
        const local = (useDataStore.getState().db[table] ?? []) as { id: string }[];
        const remote = all.data as { id: string }[];
        patch[table] = mergeRowsById(local, remote) as never;
        pulled += all.data.length;
      }
      continue;
    }

    const { data, error } = await supabase.from(table).select('*').gt('updated_at', threshold);
    if (error || !data) continue;
    if (data.length > 0) {
      const local = (useDataStore.getState().db[table] ?? []) as { id: string }[];
      const remote = data as { id: string }[];
      patch[table] = mergeRowsById(local, remote) as never;
      pulled += data.length;
    }
  }
  if (Object.keys(patch).length > 0) {
    useDataStore.getState().replaceDB({ ...useDataStore.getState().db, ...patch });
  }
  await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  return { pulled };
}
