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
  OrgInvite,
  OvertimeKind,
  OvertimeRecord,
  Payroll,
  PayrollItem,
  SalaryPaymentMethod,
  ScheduleDay,
  DEFAULT_SETTINGS,
  DEPARTMENT_PRESETS,
  defaultScheduleDays,
} from '../types';
import { TURKISH_HOLIDAYS } from '../domain/holidays-tr';
import { todayISO } from '../domain/schedule';
import { useDataStore, useSyncQueue } from './store';
import { deterministicUuid, uuid } from './id';
import { isSupabaseConfigured, supabase } from './supabase';

/**
 * Yüksek seviye işlemler. Her işlem önce yerel DB'ye yazar (anında arayüz
 * güncellenir), sonra senkron kuyruğuna ekler. Supabase modunda bordro
 * kesinleştirme gibi atomik işlemler RPC ile yapılır (çevrimiçi gerekir).
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
  if (!userId) throw new Error('Oturum yok');

  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('create_organization', { p_name: name, p_logo_url: logoUrl });
    if (error) throw new Error(error.message);
    const orgId = data as string;
    // RPC takvim/tatilleri sunucuda kurdu; çekip aynala
    const { data: schedule } = await supabase.from('schedule_days').select('*').eq('org_id', orgId);
    const { data: events } = await supabase.from('calendar_events').select('*').eq('org_id', orgId);
    const { data: members } = await supabase.from('org_members').select('*').eq('org_id', orgId);
    const { data: orgs } = await supabase.from('organizations').select('*').eq('id', orgId);
    const st = useDataStore.getState();
    if (orgs?.[0]) st.upsert('organizations', orgs[0] as Organization, false);
    if (members) st.upsert('org_members', members as never, false);
    if (schedule) st.upsert('schedule_days', schedule as never, false);
    if (events) st.upsert('calendar_events', events as never, false);
    useDataStore.getState().setOrg(orgId);
    return orgId;
  }

  const orgId = uuid();
  const org: Organization = {
    id: orgId,
    name,
    logo_url: logoUrl,
    settings: { ...DEFAULT_SETTINGS },
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  const st = useDataStore.getState();
  st.upsert('organizations', org, false);
  st.upsert(
    'org_members',
    [{ id: uuid(), org_id: orgId, user_id: userId, role: 'owner', created_at: nowISO() }],
    false
  );
  st.upsert('schedule_days', defaultScheduleDays(orgId), false);
  const curY = new Date().getFullYear();
  await ensureHolidays(orgId, curY);
  await ensureHolidays(orgId, curY + 1);
  await ensureHolidays(orgId, curY + 2);
  useDataStore.getState().setOrg(orgId);
  return orgId;
}

/**
 * Yıl devrinde tatil yeniden tohumlama (M3):
 * Belirtilen organizasyon için o yıla ait hiç resmî tatil / yarım gün kaydı yoksa
 * holidays-tr tablosundan deterministik UUID ile üretip upsert eder (enqueue=true).
 * Tekrar çağrılar idempotenttir. 2026–2030 dışındaki yıllar için sessizce 0 döner.
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

  st.upsert('calendar_events', events, true);
  return events.length;
}

export function addPresetDepartments(orgId: string) {
  const st = useDataStore.getState();
  st.upsert(
    'departments',
    DEPARTMENT_PRESETS.map((d, i) => ({
      id: uuid(),
      org_id: orgId,
      name: d.name,
      color: d.color,
      sort_order: i,
      updated_at: nowISO(),
    })),
    false
  );
}

export function updateOrgSettings(patch: Partial<Organization['settings']>) {
  const { db, orgId, upsert } = useDataStore.getState();
  const org = db.organizations.find((o) => o.id === orgId);
  if (!org) return;
  upsert('organizations', touch({ ...org, settings: { ...org.settings, ...patch } }));
}

export function updateOrgProfile(name: string, logoUrl: string | null) {
  const { db, orgId, upsert } = useDataStore.getState();
  const org = db.organizations.find((o) => o.id === orgId);
  if (!org) return;
  upsert('organizations', touch({ ...org, name, logo_url: logoUrl }));
}

// ─── Departmanlar ─────────────────────────────────────────────────────────────

export function saveDepartment(dep: Department) {
  useDataStore.getState().upsert('departments', touch(dep));
}

export function addDepartment(name: string, color: string) {
  useDataStore.getState().upsert('departments', {
    id: uuid(),
    org_id: useDataStore.getState().orgId!,
    name,
    color,
    sort_order: useDataStore.getState().db.departments.length,
    updated_at: nowISO(),
  });
}

export function removeDepartment(id: string) {
  const st = useDataStore.getState();
  // çalışanın departmanını boşa çıkar
  for (const e of st.db.employees.filter((e) => e.department_id === id)) {
    st.upsert('employees', touch({ ...e, department_id: null }));
  }
  st.remove('departments', [id]);
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
  const { orgId, upsert } = useDataStore.getState();
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
  upsert('employees', employee);
  upsert('employee_salaries', {
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

export function updateEmployee(emp: Employee) {
  useDataStore.getState().upsert('employees', touch(emp));
}

export function addSalaryRaise(employeeId: string, amount: number, effectiveFrom: string, note: string | null) {
  const { orgId, upsert } = useDataStore.getState();
  upsert('employee_salaries', {
    id: uuid(),
    org_id: orgId!,
    employee_id: employeeId,
    amount,
    effective_from: effectiveFrom,
    note,
    created_at: nowISO(),
  });
}

export function deactivateEmployee(employeeId: string, endDate: string) {
  const { db, upsert } = useDataStore.getState();
  const emp = db.employees.find((e) => e.id === employeeId);
  if (!emp) return;
  upsert('employees', touch({ ...emp, end_date: endDate, active: false }));
}

export function reactivateEmployee(employeeId: string) {
  const { db, upsert } = useDataStore.getState();
  const emp = db.employees.find((e) => e.id === employeeId);
  if (!emp) return;
  upsert('employees', touch({ ...emp, end_date: null, active: true }));
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
  const { orgId, db, upsert } = useDataStore.getState();
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
  upsert('attendance', rows);
  if (confirm) await confirmAttendanceDay(day);
}

export async function clearAttendance(day: string, employeeId: string) {
  const { db, remove } = useDataStore.getState();
  const existing = db.attendance.find((a) => a.employee_id === employeeId && a.day === day);
  if (existing) remove('attendance', [existing.id]);
}

export async function confirmAttendanceDay(day: string) {
  const { orgId, userId, db, upsert } = useDataStore.getState();
  const existing = db.attendance_days.find((d) => d.day === day);
  const row: AttendanceDay = {
    id: existing?.id ?? (await attendanceDayId(orgId!, day)),
    org_id: orgId!,
    day,
    confirmed_by: userId!,
    confirmed_at: nowISO(),
  };
  upsert('attendance_days', row);
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
  const { orgId, upsert } = useDataStore.getState();
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
  upsert('overtime', rec);
}

export function removeOvertime(id: string) {
  useDataStore.getState().remove('overtime', [id]);
}

// ─── Takvim olayları ──────────────────────────────────────────────────────────

export function saveCalendarEvent(event: CalendarEvent) {
  useDataStore.getState().upsert('calendar_events', touch(event));
}

export function removeCalendarEvent(id: string) {
  useDataStore.getState().remove('calendar_events', [id]);
}

export function saveScheduleDay(day: ScheduleDay) {
  useDataStore.getState().upsert('schedule_days', touch(day));
}

export function saveSchedule(sDays: ScheduleDay[]) {
  for (const d of sDays) saveScheduleDay(d);
}

// ─── Avans & borç ─────────────────────────────────────────────────────────────

export function giveDebt(input: {
  employee_id: string;
  amount: number;
  type: Debt['type'];
  installments: number;
  start_month: string;
  given_at?: string;
  description?: string | null;
}) {
  const { orgId, upsert } = useDataStore.getState();
  const id = uuid();
  upsert('debts', {
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

export function updateDebtInstallments(debtId: string, installments: number) {
  const { db, upsert } = useDataStore.getState();
  const debt = db.debts.find((d) => d.id === debtId);
  if (debt) upsert('debts', touch({ ...debt, installments }));
}

export function deleteDebtIfUnpaid(debtId: string): { ok: boolean; reason?: string } {
  const { db, remove } = useDataStore.getState();
  const hasPayments = db.debt_payments.some((p) => p.debt_id === debtId && p.amount > 0);
  if (hasPayments) return { ok: false, reason: 'Bu borca ait ödeme var; silinemez, kapatılabilir.' };
  remove('debts', [debtId]);
  return { ok: true };
}

export function recordDebtPayment(input: {
  debt_id: string;
  employee_id: string;
  amount: number;
  method: 'elden' | 'maas_kesinti';
  note?: string | null;
}) {
  const { orgId, upsert } = useDataStore.getState();
  upsert('debt_payments', {
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

export function adjustLeave(input: { employee_id: string; days: number; reason: string; date?: string }) {
  const { orgId, upsert } = useDataStore.getState();
  upsert('leave_adjustments', {
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
  const { orgId, db, upsert } = useDataStore.getState();
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
  upsert('payrolls', payroll);
  return payroll;
}

export async function savePayrollItems(payrollId: string, items: PayrollItem[]) {
  const { upsert } = useDataStore.getState();
  upsert('payroll_items', items.map((i) => touch(i)));
}

/** Kesinleştir: atomik anlık görüntü + taksit düşümü (PLAN 4.7) */
export async function finalizePayroll(payrollId: string, items: PayrollItem[]): Promise<void> {
  const { orgId, userId, db, upsert, remove } = useDataStore.getState();
  const payroll = db.payrolls.find((p) => p.id === payrollId);
  if (!payroll) throw new Error('Bordro bulunamadı');

  if (isSupabaseConfigured) {
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
  }

  // Yerel aynalama (cihaz modu + anında arayüz)
  const paidAt = todayISO();
  remove(
    'debt_payments',
    db.debt_payments.filter((p) => items.some((i) => i.id === p.payroll_item_id)).map((p) => p.id)
  );
  upsert('payroll_items', items.map((i) => touch({ ...i, paid_amount: 0 })));
  for (const item of items) {
    for (const alloc of item.breakdown.debtAllocations ?? []) {
      upsert('debt_payments', {
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
  upsert('payrolls', { ...payroll, status: 'kesinlesti', finalized_at: nowISO(), finalized_by: userId });
}

/** Geri al: yalnızca firma sahibi, gerekçeli (PLAN 4.7) */
export async function revertPayroll(payrollId: string, reason: string): Promise<void> {
  const { db, upsert, remove } = useDataStore.getState();
  const payroll = db.payrolls.find((p) => p.id === payrollId);
  if (!payroll) throw new Error('Bordro bulunamadı');

  if (isSupabaseConfigured) {
    const { error } = await supabase.rpc('revert_payroll', { p_payroll_id: payrollId, p_reason: reason });
    if (error) throw new Error(error.message);
  }

  const itemIds = db.payroll_items.filter((i) => i.payroll_id === payrollId).map((i) => i.id);
  remove('salary_payments', db.salary_payments.filter((p) => itemIds.includes(p.payroll_item_id)).map((p) => p.id));
  remove('debt_payments', db.debt_payments.filter((p) => p.payroll_item_id && itemIds.includes(p.payroll_item_id)).map((p) => p.id));
  for (const item of db.payroll_items.filter((i) => i.payroll_id === payrollId)) {
    upsert('payroll_items', touch({ ...item, paid_amount: 0 }));
  }
  upsert('payrolls', { ...payroll, status: 'taslak', revert_reason: reason });
}

export async function recordSalaryPayment(input: {
  payroll_item_id: string;
  employee_id: string;
  amount: number;
  method: SalaryPaymentMethod;
}): Promise<void> {
  const { orgId, db, upsert } = useDataStore.getState();
  upsert('salary_payments', {
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
    upsert('payroll_items', touch({ ...item, paid_amount: itemPayments.reduce((s, p) => s + p.amount, 0) }));
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
      upsert('payrolls', { ...payroll, status: 'odendi' });
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

// ─── Davet ────────────────────────────────────────────────────────────────────

export async function createInviteCode(): Promise<string> {
  const { orgId, userId, upsert } = useDataStore.getState();
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('create_invite');
    if (error) throw new Error(error.message);
    return data as string;
  }
  // Cihaz modu: kod yalnız bu cihazda geçerli
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const invite: OrgInvite = {
    id: uuid(),
    org_id: orgId!,
    code,
    role: 'admin',
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    used_by: null,
    created_by: userId!,
    created_at: nowISO(),
  };
  upsert('org_invites', invite);
  return code;
}

export async function joinByInviteCode(code: string): Promise<string> {
  const { userId, db, upsert, setOrg } = useDataStore.getState();
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('join_organization', { p_code: code.trim() });
    if (error) throw new Error(error.message);
    const orgId = data as string;
    const { data: orgs } = await supabase.from('organizations').select('*').eq('id', orgId);
    if (orgs?.[0]) upsert('organizations', orgs[0] as Organization, false);
    setOrg(orgId);
    return orgId;
  }
  const invite = db.org_invites.find((i) => i.code === code.trim() && !i.used_by && new Date(i.expires_at) > new Date());
  if (!invite) throw new Error('Davet kodu geçersiz veya süresi geçmiş');
  upsert('org_invites', { ...invite, used_by: userId });
  upsert('org_members', { id: uuid(), org_id: invite.org_id, user_id: userId!, role: invite.role, created_at: nowISO() }, false);
  setOrg(invite.org_id);
  return invite.org_id;
}

// ─── Hesap silme (Play zorunluluğu, PLAN 8) ───────────────────────────────────

export async function deleteAccountEverywhere(): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) throw new Error('Hesap silinemedi: ' + error.message);
    await supabase.auth.signOut();
  }
  // Yerel veriyi ve oturumu temizle
  await AsyncStorage.multiRemove([
    'tekstil:local-session',
    'tekstil:local-accounts',
    'tekstil:last-sync',
    'tekstil:prefs',
  ]);
  const { replaceDB, setOrg } = useDataStore.getState();
  const { emptyDB } = await import('./persist');
  replaceDB(emptyDB());
  useSyncQueue.getState().setPending([]);
  setOrg(null);
}
