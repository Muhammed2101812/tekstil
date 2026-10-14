import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AttendanceDay,
  AttendanceRecord,
  AttendanceStatus,
  CalendarEvent,
  Debt,
  Department,
  Employee,
  Organization,
  OvertimeKind,
  OvertimeRecord,
  Payroll,
  PayrollItem,
  ProductionBatch,
  SalaryPaymentMethod,
  ScheduleDay,
  DEPARTMENT_PRESETS,
} from '../types';
import { TURKISH_HOLIDAYS } from '../domain/holidays-tr';
import { todayISO } from '../domain/schedule';
import { useDataStore, useSyncState, emptyDB } from './store';
import { deterministicUuid, uuid } from './id';
import { pullAll, remoteDelete, remoteUpsert, supabase } from './supabase';

/**
 * Yüksek seviye işlemler — tamamen online (agent.md yazma kuralı):
 * Her işlem ÖNCE `await` ile Supabase'e gider (remoteUpsert/remoteDelete/RPC);
 * işlem başarılı olursa bellek içi store güncellenir. Başarısızlıkta exception
 * fırlatılır, store'a dokunulmaz ve arayüz hatayı kullanıcıya gösterir.
 */

function nowISO() {
  return new Date().toISOString();
}

function touch<T extends { updated_at?: string }>(row: T): T {
  return { ...row, updated_at: nowISO() };
}

async function attendanceId(employeeId: string, day: string) {
  return deterministicUuid(`att:${employeeId}:${day}`);
}
async function attendanceDayId(orgId: string, day: string) {
  return deterministicUuid(`attd:${orgId}:${day}`);
}
async function payrollIdFor(orgId: string, year: number, month: number) {
  return deterministicUuid(`pay:${orgId}:${year}:${month}`);
}
async function payrollItemIdFor(payrollId: string, employeeId: string) {
  return deterministicUuid(`pi:${payrollId}:${employeeId}`);
}
async function overtimeEventId(eventId: string, employeeId: string) {
  return deterministicUuid(`ot:${eventId}:${employeeId}`);
}

// ─── Firma kurulumu ───────────────────────────────────────────────────────────

export async function createOrganization(name: string, logoUrl: string | null): Promise<string> {
  const { userId } = useDataStore.getState();
  if (!userId || userId === 'anon') throw new Error('Oturum yok');

  const { data, error } = await supabase.rpc('create_organization', { p_name: name, p_logo_url: logoUrl });
  if (error) throw new Error(error.message);
  const orgId = data as string;
  // RPC takvim/tatilleri sunucuda kurdu; çekip aynala
  const { data: schedule } = await supabase.from('schedule_days').select('*').eq('org_id', orgId);
  const { data: events } = await supabase.from('calendar_events').select('*').eq('org_id', orgId);
  const { data: members } = await supabase.from('org_members').select('*').eq('org_id', orgId);
  const { data: orgs } = await supabase.from('organizations').select('*').eq('id', orgId);
  const st = useDataStore.getState();
  if (orgs?.[0]) st.upsert('organizations', orgs[0] as Organization);
  if (members) st.upsert('org_members', members as never);
  if (schedule) st.upsert('schedule_days', schedule as never);
  if (events) st.upsert('calendar_events', events as never);
  useDataStore.getState().setOrg(orgId);
  return orgId;
}

/**
 * Yıl devrinde tatil yeniden tohumlama (M3): sunucuda o yıla ait resmî tatil /
 * yarım gün yoksa holidays-tr tablosundan deterministik UUID ile üretip
 * Supabase'e yazar. Tekrar çağrılar idempotenttir. 2026–2030 dışı: 0 döner.
 */
export async function ensureHolidays(orgId: string, yil: number): Promise<number> {
  if (yil < 2026 || yil > 2030) return 0;
  const prefix = `${yil}-`;
  const st = useDataStore.getState();
  const existing = st.db.calendar_events.filter(
    (e) => e.org_id === orgId && e.date.startsWith(prefix) && (e.type === 'resmi_tatil' || e.type === 'yarim_gun')
  );
  if (existing.length > 0) return 0;

  const holidaysOfYear = TURKISH_HOLIDAYS.filter((h) => h.date.startsWith(prefix));
  if (holidaysOfYear.length === 0) return 0;

  const now = nowISO();
  const events: CalendarEvent[] = [];
  for (const h of holidaysOfYear) {
    const id = await deterministicUuid(`hol:${orgId}:${h.date}:${h.title}`);
    events.push({
      id,
      org_id: orgId,
      date: h.date,
      type: h.type,
      title: h.title,
      start_time: h.start_time,
      end_time: h.end_time,
      paid: h.paid,
      multiplier: h.multiplier,
      scope: h.scope,
      department_id: h.department_id,
      employee_ids: h.employee_ids,
      updated_at: now,
    });
  }

  await remoteUpsert('calendar_events', events);
  return events.length;
}

export async function addPresetDepartments(orgId: string) {
  await remoteUpsert(
    'departments',
    DEPARTMENT_PRESETS.map((d, i) => ({
      id: uuid(),
      org_id: orgId,
      name: d.name,
      color: d.color,
      sort_order: i,
      updated_at: nowISO(),
    }))
  );
}

export async function updateOrgSettings(patch: Partial<Organization['settings']>) {
  const { db, orgId } = useDataStore.getState();
  const org = db.organizations.find((o) => o.id === orgId);
  if (!org) return;
  await remoteUpsert('organizations', touch({ ...org, settings: { ...org.settings, ...patch } }));
}

export async function updateOrgProfile(name: string, logoUrl: string | null) {
  const { db, orgId } = useDataStore.getState();
  const org = db.organizations.find((o) => o.id === orgId);
  if (!org) return;
  await remoteUpsert('organizations', touch({ ...org, name, logo_url: logoUrl }));
}

// ─── Departmanlar ─────────────────────────────────────────────────────────────

export async function saveDepartment(dep: Department) {
  await remoteUpsert('departments', touch(dep));
}

export async function addDepartment(name: string, color: string) {
  const st = useDataStore.getState();
  await remoteUpsert('departments', {
    id: uuid(),
    org_id: st.orgId!,
    name,
    color,
    sort_order: st.db.departments.length,
    updated_at: nowISO(),
  });
}

export async function removeDepartment(id: string) {
  const st = useDataStore.getState();
  // çalışanın departmanını boşa çıkar (önce sunucuda)
  const affected = st.db.employees.filter((e) => e.department_id === id);
  if (affected.length > 0) {
    await remoteUpsert('employees', affected.map((e) => touch({ ...e, department_id: null })));
  }
  await remoteDelete('departments', [id]);
}

// ─── Çalışanlar ───────────────────────────────────────────────────────────────

export interface EmployeeInput {
  full_name: string;
  department_id?: string | null;
  start_date: string;
  salary: number;
  phone?: string | null;
  tc_no?: string | null;
  iban?: string | null;
  birth_date?: string | null;
  address?: string | null;
  photo_url?: string | null;
  notes?: string | null;
  emergency_contact?: string | null;
}

export async function addEmployee(input: EmployeeInput): Promise<Employee> {
  const { orgId } = useDataStore.getState();
  const id = uuid();
  const employee: Employee = {
    id,
    org_id: orgId!,
    department_id: input.department_id ?? null,
    full_name: input.full_name.trim(),
    phone: input.phone ?? null,
    tc_no: input.tc_no ?? null,
    iban: input.iban ?? null,
    birth_date: input.birth_date ?? null,
    address: input.address ?? null,
    photo_url: input.photo_url ?? null,
    start_date: input.start_date,
    end_date: null,
    active: true,
    notes: input.notes ?? null,
    emergency_contact: input.emergency_contact ?? null,
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  await remoteUpsert('employees', employee);
  await remoteUpsert('employee_salaries', {
    id: uuid(),
    org_id: orgId!,
    employee_id: id,
    amount: input.salary,
    effective_from: input.start_date,
    note: 'Başlangıç maaşı',
    created_at: nowISO(),
  });
  return employee;
}

export async function updateEmployee(emp: Employee) {
  await remoteUpsert('employees', touch(emp));
}

export async function addSalaryRaise(employeeId: string, amount: number, effectiveFrom: string, note: string | null) {
  const { orgId } = useDataStore.getState();
  await remoteUpsert('employee_salaries', {
    id: uuid(),
    org_id: orgId!,
    employee_id: employeeId,
    amount,
    effective_from: effectiveFrom,
    note,
    created_at: nowISO(),
  });
}

export async function deactivateEmployee(employeeId: string, endDate: string) {
  const { db } = useDataStore.getState();
  const emp = db.employees.find((e) => e.id === employeeId);
  if (!emp) return;
  await remoteUpsert('employees', touch({ ...emp, end_date: endDate, active: false }));
}

export async function reactivateEmployee(employeeId: string) {
  const { db } = useDataStore.getState();
  const emp = db.employees.find((e) => e.id === employeeId);
  if (!emp) return;
  await remoteUpsert('employees', touch({ ...emp, end_date: null, active: true }));
}

// ─── Puantaj ──────────────────────────────────────────────────────────────────

export interface AttendanceInput {
  employee_id: string;
  status: AttendanceStatus;
  arrival_time?: string | null;
  leave_time?: string | null;
  late_minutes?: number;
  early_leave_minutes?: number;
  note?: string | null;
}

export async function markAttendance(day: string, inputs: AttendanceInput[], confirm = false) {
  const { orgId, db } = useDataStore.getState();
  const rows: AttendanceRecord[] = [];
  for (const input of inputs) {
    const existing = db.attendance.find((a) => a.employee_id === input.employee_id && a.day === day);
    const id = existing?.id ?? (await attendanceId(input.employee_id, day));
    rows.push({
      id,
      org_id: orgId!,
      employee_id: input.employee_id,
      day,
      status: input.status,
      arrival_time: input.arrival_time ?? (existing?.arrival_time ?? null),
      leave_time: input.leave_time ?? (existing?.leave_time ?? null),
      late_minutes: input.late_minutes ?? (existing?.late_minutes ?? 0),
      early_leave_minutes: input.early_leave_minutes ?? (existing?.early_leave_minutes ?? 0),
      note: input.note ?? (existing?.note ?? null),
      updated_at: nowISO(),
    });
  }
  await remoteUpsert('attendance', rows);
  if (confirm) await confirmAttendanceDay(day);
}

export async function clearAttendance(day: string, employeeId: string) {
  const { db } = useDataStore.getState();
  const existing = db.attendance.find((a) => a.employee_id === employeeId && a.day === day);
  if (existing) await remoteDelete('attendance', [existing.id]);
}

export async function confirmAttendanceDay(day: string) {
  const { orgId, userId, db } = useDataStore.getState();
  const existing = db.attendance_days.find((d) => d.day === day);
  const row: AttendanceDay = {
    id: existing?.id ?? (await attendanceDayId(orgId!, day)),
    org_id: orgId!,
    day,
    confirmed_by: userId!,
    confirmed_at: nowISO(),
  };
  await remoteUpsert('attendance_days', row);
}

// ─── Mesai ────────────────────────────────────────────────────────────────────

export async function addOvertime(input: {
  employee_id: string;
  day: string;
  hours: number;
  kind: OvertimeKind;
  multiplier?: number | null;
  calendar_event_id?: string | null;
  note?: string | null;
}) {
  const { orgId } = useDataStore.getState();
  const id = input.calendar_event_id
    ? await overtimeEventId(input.calendar_event_id, input.employee_id)
    : uuid();
  const rec: OvertimeRecord = {
    id,
    org_id: orgId!,
    employee_id: input.employee_id,
    day: input.day,
    hours: input.hours,
    kind: input.kind,
    multiplier: input.multiplier ?? null,
    calendar_event_id: input.calendar_event_id ?? null,
    note: input.note ?? null,
    client_ref: id,
    updated_at: nowISO(),
  };
  await remoteUpsert('overtime', rec);
}

export async function removeOvertime(id: string) {
  await remoteDelete('overtime', [id]);
}

// ─── Takvim olayları ──────────────────────────────────────────────────────────

export async function saveCalendarEvent(event: CalendarEvent) {
  await remoteUpsert('calendar_events', touch(event));
}

export async function removeCalendarEvent(id: string) {
  await remoteDelete('calendar_events', [id]);
}

export async function saveScheduleDay(day: ScheduleDay) {
  await remoteUpsert('schedule_days', touch(day));
}

export async function saveSchedule(sDays: ScheduleDay[]) {
  for (const d of sDays) await saveScheduleDay(d);
}

// ─── Avans & borç ─────────────────────────────────────────────────────────────

export async function giveDebt(input: {
  employee_id: string;
  amount: number;
  type: Debt['type'];
  installments: number;
  start_month: string;
  given_at?: string;
  description?: string | null;
}): Promise<string> {
  const { orgId } = useDataStore.getState();
  const id = uuid();
  await remoteUpsert('debts', {
    id,
    org_id: orgId!,
    employee_id: input.employee_id,
    type: input.type,
    amount: input.amount,
    given_at: input.given_at ?? todayISO(),
    installments: input.installments,
    start_month: input.start_month,
    description: input.description ?? null,
    client_ref: id,
    updated_at: nowISO(),
  });
  return id;
}

export async function updateDebtInstallments(debtId: string, installments: number) {
  const { db } = useDataStore.getState();
  const debt = db.debts.find((d) => d.id === debtId);
  if (debt) await remoteUpsert('debts', touch({ ...debt, installments }));
}

export async function deleteDebtIfUnpaid(debtId: string): Promise<{ ok: boolean; reason?: string }> {
  const { db } = useDataStore.getState();
  const hasPayments = db.debt_payments.some((p) => p.debt_id === debtId && p.amount > 0);
  if (hasPayments) return { ok: false, reason: 'Bu borca ait ödeme var; silinemez, kapatılabilir.' };
  try {
    await remoteDelete('debts', [debtId]);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Silme başarısız' };
  }
}

export async function recordDebtPayment(input: {
  debt_id: string;
  employee_id: string;
  amount: number;
  method: 'elden' | 'maas_kesinti';
  note?: string | null;
}) {
  const { orgId } = useDataStore.getState();
  await remoteUpsert('debt_payments', {
    id: uuid(),
    org_id: orgId!,
    debt_id: input.debt_id,
    employee_id: input.employee_id,
    amount: input.amount,
    paid_at: todayISO(),
    method: input.method,
    payroll_item_id: null,
    note: input.note ?? null,
  });
}

// ─── Yıllık izin ──────────────────────────────────────────────────────────────

export async function adjustLeave(input: { employee_id: string; days: number; reason: string; date?: string }) {
  const { orgId } = useDataStore.getState();
  await remoteUpsert('leave_adjustments', {
    id: uuid(),
    org_id: orgId!,
    employee_id: input.employee_id,
    days: input.days,
    reason: input.reason,
    date: input.date ?? todayISO(),
  });
}

// ─── Bordro ───────────────────────────────────────────────────────────────────

export async function ensurePayroll(year: number, month: number): Promise<Payroll> {
  const { orgId, db } = useDataStore.getState();
  const existing = db.payrolls.find((p) => p.year === year && p.month === month);
  if (existing) return existing;
  const payroll: Payroll = {
    id: await payrollIdFor(orgId!, year, month),
    org_id: orgId!,
    year,
    month,
    status: 'taslak',
    finalized_at: null,
    finalized_by: null,
    revert_reason: null,
    created_at: nowISO(),
  };
  await remoteUpsert('payrolls', payroll);
  return payroll;
}

export async function savePayrollItems(payrollId: string, items: PayrollItem[]) {
  await remoteUpsert('payroll_items', items.map((i) => touch({ ...i, payroll_id: payrollId })));
}

/** Kesinleştir: atomik anlık görüntü + taksit düşümü (PLAN 4.7) */
export async function finalizePayroll(payrollId: string, items: PayrollItem[]): Promise<void> {
  const { orgId, userId, db } = useDataStore.getState();
  const payroll = db.payrolls.find((p) => p.id === payrollId);
  if (!payroll) throw new Error('Bordro bulunamadı');

  const payload = await Promise.all(
    items.map(async (i) => ({
      id: i.id,
      employee_id: i.employee_id,
      employee_name: i.employee_name,
      department_name: i.department_name,
      bonus: i.bonus,
      extra_cut: i.extra_cut,
      extra_cut_note: i.extra_cut_note,
      skip_debt: i.skip_debt,
      debt_override: i.debt_override,
      base_salary: i.base_salary,
      hourly_rate: i.hourly_rate,
      absence_cut: i.absence_cut,
      overtime_pay: i.overtime_pay,
      debt_cut: i.debt_cut,
      net_payable: i.net_payable,
      breakdown: i.breakdown,
      debt_allocations: await Promise.all(
        (i.breakdown.debtAllocations ?? []).map(async (alloc) => {
          const paymentId = await deterministicUuid(`dp:${i.id}:${alloc.debt_id}`);
          return {
            ...alloc,
            payment_id: paymentId,
            paymentId,
          };
        })
      ),
    }))
  );
  const { error } = await supabase.rpc('finalize_payroll', { p_payroll_id: payrollId, p_items: payload });
  if (error) throw new Error(error.message);

  // Yerel aynalama (anında arayüz) — RPC başarılı döndükten sonra
  const paidAt = todayISO();
  useDataStore.getState().remove(
    'debt_payments',
    db.debt_payments.filter((p) => items.some((i) => i.id === p.payroll_item_id)).map((p) => p.id)
  );
  useDataStore.getState().upsert('payroll_items', items.map((i) => touch({ ...i, paid_amount: 0 })));
  for (const item of items) {
    for (const alloc of item.breakdown.debtAllocations ?? []) {
      useDataStore.getState().upsert('debt_payments', {
        id: await deterministicUuid(`dp:${item.id}:${alloc.debt_id}`),
        org_id: orgId!,
        debt_id: alloc.debt_id,
        employee_id: item.employee_id,
        amount: alloc.amount,
        paid_at: paidAt,
        method: 'maas_kesinti',
        payroll_item_id: item.id,
        note: null,
      });
    }
  }
  useDataStore.getState().upsert('payrolls', { ...payroll, status: 'kesinlesti', finalized_at: nowISO(), finalized_by: userId });

  // Önemli yazma: sunucudan güncel durumu çek
  await pullAll();
}

/** Geri al: yalnızca firma sahibi, gerekçeli (PLAN 4.7) */
export async function revertPayroll(payrollId: string, reason: string): Promise<void> {
  const { db } = useDataStore.getState();
  const payroll = db.payrolls.find((p) => p.id === payrollId);
  if (!payroll) throw new Error('Bordro bulunamadı');

  const { error } = await supabase.rpc('revert_payroll', { p_payroll_id: payrollId, p_reason: reason });
  if (error) throw new Error(error.message);

  const itemIds = db.payroll_items.filter((i) => i.payroll_id === payrollId).map((i) => i.id);
  const st = useDataStore.getState();
  st.remove('salary_payments', db.salary_payments.filter((p) => itemIds.includes(p.payroll_item_id)).map((p) => p.id));
  st.remove('debt_payments', db.debt_payments.filter((p) => p.payroll_item_id && itemIds.includes(p.payroll_item_id)).map((p) => p.id));
  for (const item of db.payroll_items.filter((i) => i.payroll_id === payrollId)) {
    st.upsert('payroll_items', touch({ ...item, paid_amount: 0 }));
  }
  st.upsert('payrolls', { ...payroll, status: 'taslak', revert_reason: reason });

  // Önemli yazma: sunucudan güncel durumu çek
  await pullAll();
}

export async function recordSalaryPayment(input: {
  payroll_item_id: string;
  employee_id: string;
  amount: number;
  method: SalaryPaymentMethod;
}): Promise<void> {
  const { orgId, db } = useDataStore.getState();
  await remoteUpsert('salary_payments', {
    id: uuid(),
    org_id: orgId!,
    payroll_item_id: input.payroll_item_id,
    employee_id: input.employee_id,
    amount: input.amount,
    paid_at: todayISO(),
    method: input.method,
    note: null,
  });
  const item = db.payroll_items.find((i) => i.id === input.payroll_item_id);
  if (item) {
    const itemPayments = [
      ...db.salary_payments.filter((p) => p.payroll_item_id === item.id),
      { amount: input.amount },
    ];
    await remoteUpsert('payroll_items', touch({ ...item, paid_amount: itemPayments.reduce((s, p) => s + p.amount, 0) }));
  }
  // Tüm kalemler ödendiyse bordroyu "ödendi" yap
  const payroll = db.payrolls.find((p) => p.id === item?.payroll_id);
  if (payroll) {
    const items = db.payroll_items.filter((i) => i.payroll_id === payroll.id);
    const allPaid = items.every((i) => {
      const paid = i.id === input.payroll_item_id
        ? (db.salary_payments.filter((p) => p.payroll_item_id === i.id).reduce((s, p) => s + p.amount, 0) + input.amount)
        : db.salary_payments.filter((p) => p.payroll_item_id === i.id).reduce((s, p) => s + p.amount, 0);
      return paid >= i.net_payable - 0.005;
    });
    if (allPaid && payroll.status === 'kesinlesti') {
      await remoteUpsert('payrolls', { ...payroll, status: 'odendi' });
    }
  }
}

export async function payrollItemIdsFor(payrollId: string, employees: Employee[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const e of employees) {
    map[e.id] = await payrollItemIdFor(payrollId, e.id);
  }
  return map;
}

// ─── Kullanıcı yönetimi ───────────────────────────────────────────────────────

/**
 * Üyeyi şirketten çıkarır. Owner-only; kendini çıkarma ve son Firma Sahibi'ni
 * çıkarma engellenir. Sunucu tarafında RLS (is_org_owner) aynı kuralı zorlar.
 */
export async function removeMember(memberId: string, currentUserId: string): Promise<void> {
  const st = useDataStore.getState();
  const members = st.db.org_members.filter((m) => m.org_id === st.orgId);
  const actor = members.find((m) => m.user_id === currentUserId);
  const target = members.find((m) => m.id === memberId);
  if (!actor || actor.role !== 'owner') {
    throw new Error('Üye çıkarmak için Firma Sahibi yetkisi gerekir.');
  }
  if (!target) throw new Error('Üye bulunamadı.');
  if (target.user_id === currentUserId) {
    throw new Error('Kendinizi şirketten çıkaramazsınız.');
  }
  const ownerCount = members.filter((m) => m.role === 'owner').length;
  if (target.role === 'owner' && ownerCount <= 1) {
    throw new Error('Şirketteki son Firma Sahibi çıkarılamaz.');
  }
  await remoteDelete('org_members', [memberId]);
  await pullAll();
}

// ─── Hesap silme (Play zorunluluğu, PLAN 8) ───────────────────────────────────

/** Cihazda kalmış eski yerel yedek/snapshot klasörünü temizler (Faz 2.4) */
async function purgeLegacyLocalArtifacts() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter(
      (k) =>
        k.startsWith('tekstil:local-') ||
        k.startsWith('tekstil:snapshot:') ||
        k === 'tekstil:last-sync'
    );
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);

    if (Platform.OS !== 'web') {
      const fs = await import('expo-file-system');
      const dir = new fs.Directory(fs.Paths.document, 'backups');
      if (dir.exists) dir.delete();
    }
  } catch {
    // temizlik best-effort — hesap silme akışını bloklamaz
  }
}

export async function deleteAccountEverywhere(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw new Error('Hesap silinemedi: ' + error.message);
  await supabase.auth.signOut();

  // Bellek içi store + senkron bayraklarını sıfırla
  const { replaceDB, setOrg } = useDataStore.getState();
  replaceDB(emptyDB());
  setOrg(null);
  useSyncState.getState().reset();

  // Cihazdaki eski kalıntıları (yerel hesaplar, snapshot anahtarları, backups/) temizle
  await purgeLegacyLocalArtifacts();
}

// ─── Üretim / Parti Takibi ───────────────────────────────────────────────────

export async function addProductionBatch(input: {
  id?: string;
  model_name: string;
  label_color: import('../types').LabelColor;
  quantity: number;
  date?: string;
  note?: string | null;
}): Promise<string> {
  const orgId = useDataStore.getState().orgId;
  if (!orgId) throw new Error('Firma seçili değil');
  if (!input.model_name.trim()) throw new Error('Model adı zorunludur');
  if (!input.quantity || input.quantity <= 0) throw new Error('Adet sıfırdan büyük olmalıdır');

  const id = input.id ?? (await uuid());
  const row: ProductionBatch = {
    id,
    org_id: orgId,
    model_name: input.model_name.trim(),
    label_color: input.label_color,
    quantity: Math.floor(input.quantity),
    date: input.date ?? todayISO(),
    note: input.note?.trim() || null,
    created_at: nowISO(),
    updated_at: nowISO(),
  };

  await remoteUpsert('production_batches', row);
  return id;
}

export async function deleteProductionBatch(id: string): Promise<void> {
  await remoteDelete('production_batches', [id]);
}

