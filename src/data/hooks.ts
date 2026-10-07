import { useMemo } from 'react';
import { DEFAULT_SETTINGS, OrgSettings, AttendanceRecord, Employee, EmployeeSalary } from '../types';
import { useDataStore, useSyncQueue } from './store';
import { useAuth } from './auth';

/**
 * Okuma seçicileri — yerel DB'den zustand ile abone olma (anında güncelleme).
 *
 * Önemli: zustand v5 + React 19'da seçici her çağrıda YENİ dizi/nesne
 * döndürürse sonsuz render döngüsü oluşur. Bu yüzden seçiciler yalnızca
 * tablonun kendisini (kararlı referans) döndürür; filtreleme/sıralama
 * useMemo ile türetilir.
 */

export function useOrgId(): string | null {
  return useDataStore((s) => s.orgId);
}

export function useOrg() {
  const orgId = useOrgId();
  const organizations = useDataStore((s) => s.db.organizations);
  return useMemo(() => organizations.find((o) => o.id === orgId) ?? null, [organizations, orgId]);
}

export function useSettings(): OrgSettings {
  const org = useOrg();
  return useMemo(() => (org ? { ...DEFAULT_SETTINGS, ...org.settings } : DEFAULT_SETTINGS), [org]);
}

export function useMemberships() {
  const userId = useAuth().userId;
  const members = useDataStore((s) => s.db.org_members);
  return useMemo(() => members.filter((m) => m.user_id === userId), [members, userId]);
}

export function useDepartments() {
  const orgId = useOrgId();
  const departments = useDataStore((s) => s.db.departments);
  return useMemo(
    () => departments.filter((d) => d.org_id === orgId).sort((a, b) => a.sort_order - b.sort_order),
    [departments, orgId]
  );
}

export function useSchedule() {
  const orgId = useOrgId();
  const schedule = useDataStore((s) => s.db.schedule_days);
  return useMemo(() => schedule.filter((d) => d.org_id === orgId), [schedule, orgId]);
}

export function useEvents(year?: number) {
  const orgId = useOrgId();
  const events = useDataStore((s) => s.db.calendar_events);
  return useMemo(
    () =>
      events
        .filter((e) => e.org_id === orgId && (year === undefined || e.date.startsWith(String(year))))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [events, orgId, year]
  );
}

export function useEmployees(opts: { active?: boolean } = {}) {
  const orgId = useOrgId();
  const employees = useDataStore((s) => s.db.employees);
  const active = opts.active;
  return useMemo(
    () =>
      employees
        .filter((e) => e.org_id === orgId && (active === undefined || e.active === active))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')),
    [employees, orgId, active]
  );
}

export function useEmployee(id: string | undefined): Employee | null {
  const employees = useDataStore((s) => s.db.employees);
  return useMemo(() => (id ? employees.find((e) => e.id === id) ?? null : null), [employees, id]);
}

export function useSalaries(employeeId: string | undefined): EmployeeSalary[] {
  const salaries = useDataStore((s) => s.db.employee_salaries);
  return useMemo(
    () => salaries.filter((x) => x.employee_id === employeeId).sort((a, b) => a.effective_from.localeCompare(b.effective_from)),
    [salaries, employeeId]
  );
}

export function useAllSalaries() {
  const orgId = useOrgId();
  const salaries = useDataStore((s) => s.db.employee_salaries);
  return useMemo(() => salaries.filter((x) => x.org_id === orgId), [salaries, orgId]);
}

export function useDayAttendance(day: string) {
  const attendance = useDataStore((s) => s.db.attendance);
  const attendanceDays = useDataStore((s) => s.db.attendance_days);
  const byEmployee = useMemo(() => {
    const m = new Map<string, AttendanceRecord>();
    for (const a of attendance) {
      if (a.day === day) m.set(a.employee_id, a);
    }
    return m;
  }, [attendance, day]);
  const confirmed = useMemo(() => attendanceDays.some((d) => d.day === day), [attendanceDays, day]);
  return { byEmployee, confirmed };
}

export function useMonthAttendance(year: number, month: number) {
  const attendance = useDataStore((s) => s.db.attendance);
  return useMemo(() => attendance.filter((a) => a.day.startsWith(`${year}-${String(month).padStart(2, '0')}`)), [attendance, year, month]);
}

export function useMonthOvertime(year: number, month: number) {
  const overtime = useDataStore((s) => s.db.overtime);
  return useMemo(() => overtime.filter((o) => o.day.startsWith(`${year}-${String(month).padStart(2, '0')}`)), [overtime, year, month]);
}

export function useEmployeeOvertime(employeeId: string) {
  const overtime = useDataStore((s) => s.db.overtime);
  return useMemo(() => overtime.filter((o) => o.employee_id === employeeId), [overtime, employeeId]);
}

export function useDebts(employeeId?: string) {
  const orgId = useOrgId();
  const debts = useDataStore((s) => s.db.debts);
  return useMemo(() => debts.filter((d) => d.org_id === orgId && (!employeeId || d.employee_id === employeeId)), [debts, orgId, employeeId]);
}

export function useDebtPayments(employeeId?: string) {
  const orgId = useOrgId();
  const payments = useDataStore((s) => s.db.debt_payments);
  return useMemo(() => payments.filter((p) => p.org_id === orgId && (!employeeId || p.employee_id === employeeId)), [payments, orgId, employeeId]);
}

export function useLeaveAdjustments(employeeId: string | undefined) {
  const adjustments = useDataStore((s) => s.db.leave_adjustments);
  return useMemo(() => adjustments.filter((l) => l.employee_id === employeeId), [adjustments, employeeId]);
}

export function usePayroll(year: number, month: number) {
  const payrolls = useDataStore((s) => s.db.payrolls);
  return useMemo(() => payrolls.find((p) => p.year === year && p.month === month) ?? null, [payrolls, year, month]);
}

export function usePayrollItems(payrollId: string | undefined) {
  const items = useDataStore((s) => s.db.payroll_items);
  return useMemo(() => (payrollId ? items.filter((i) => i.payroll_id === payrollId) : []), [items, payrollId]);
}

export function useSalaryPayments(payrollId: string | undefined) {
  const items = useDataStore((s) => s.db.payroll_items);
  const payments = useDataStore((s) => s.db.salary_payments);
  return useMemo(() => {
    if (!payrollId) return [];
    const ids = new Set(items.filter((i) => i.payroll_id === payrollId).map((i) => i.id));
    return payments.filter((p) => ids.has(p.payroll_item_id));
  }, [items, payments, payrollId]);
}

export function useSyncStatus(): { pending: number; online: boolean } {
  const pending = useSyncQueue((s) => s.pending.length);
  const online = useSyncQueue((s) => s.online);
  return { pending, online };
}
