import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataDB, useDataStore } from './store';

/**
 * Supabase istemcisi. Uygulamada yalnızca `anon` anahtar bulunur; tüm yetki
 * RLS ile satır bazında verilir (agent.md). Anahtarlar yoksa uygulama çevrimiçi
 * çalışamaz — kök layout yapılandırma hatası ekranı gösterir.
 *
 * Yazma kuralı (agent.md): her mutasyon önce `await` ile buradaki
 * remoteUpsert/remoteDelete (veya RPC/Edge Function) üzerinden gider; işlem
 * başarılıysa bellek içi store güncellenir, başarısızsa hata fırlatılır.
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

/** numeric alanlar Supabase'ten dizgi döner → number'a çevir */
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
  production_batches: ['quantity'],
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

/**
 * Remote-first yazma: ÖNCE Supabase'e upsert; hata varsa exception fırlatılır ve
 * bellek içi store'a dokunulmaz. Başarıda store aynası güncellenir.
 */
export async function remoteUpsert<T extends keyof DataDB>(
  table: T,
  rows: DataDB[T] | DataDB[T][number]
): Promise<void> {
  const list = (Array.isArray(rows) ? rows : [rows]) as unknown as Record<string, unknown>[];
  if (list.length === 0) return;
  const { error } = await supabase.from(table).upsert(list.map((r) => toNumbers(table, r)), {
    onConflict: 'id',
  });
  if (error) throw new Error(error.message);
  useDataStore.getState().upsert(table, list as never);
}

/**
 * Remote-first silme: ÖNCE Supabase'ten siler; hata varsa exception fırlatılır.
 * Başarıda store aynasından düşürür. (DB tarafında DELETE yalnız firma sahibine
 * açıktır — 0007_data_protection.sql.)
 */
export async function remoteDelete(table: keyof DataDB, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from(table).delete().in('id', ids);
  if (error) throw new Error(error.message);
  useDataStore.getState().remove(table, ids);
}

/** Uzaktan değişen satırları çeker (updated_at > lastSync). Uzak satır kazanır. */
const LAST_SYNC_KEY = 'tekstil:last-sync';

/**
 * Uzaktan gelen satırları yerel önbellekle birleştirir (id bazlı merge).
 * - Uzaktaki satır yerelde varsa: uzak kazanır (üzerine yazılır).
 * - Uzaktaki satır yerelde yoksa: listeye eklenir.
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

export async function pullAll(): Promise<{ pulled: number; ok: boolean }> {
  const tables: (keyof DataDB)[] = [
    'organizations', 'org_members', 'departments', 'schedule_days',
    'calendar_events', 'employees', 'employee_salaries', 'attendance', 'attendance_days',
    'overtime', 'debts', 'debt_payments', 'leave_adjustments', 'payrolls',
    'payroll_items', 'salary_payments', 'production_batches',
  ];
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
  let hadError = false;
  const patch: Partial<DataDB> = {};
  const noUpdatedAtTables: (keyof DataDB)[] = [
    'organizations',
    'org_members',
    'employee_salaries',
    'attendance_days',
    'debt_payments',
    'leave_adjustments',
    'payrolls',
    'salary_payments',
  ];

  for (const table of tables) {
    if (noUpdatedAtTables.includes(table)) {
      // bu tablolarda updated_at yok — hepsini çek ve önbellekle merge et
      const all = await supabase.from(table).select('*');
      if (all.error) hadError = true;
      if (!all.error && all.data) {
        const local = (useDataStore.getState().db[table] ?? []) as { id: string }[];
        const remote = all.data as { id: string }[];
        patch[table] = mergeRowsById(local, remote) as never;
        pulled += all.data.length;
      }
      continue;
    }

    const { data, error } = await supabase.from(table).select('*').gt('updated_at', threshold);
    if (error) hadError = true;
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
  return { pulled, ok: !hadError };
}
