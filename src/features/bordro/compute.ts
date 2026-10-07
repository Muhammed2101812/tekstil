import {
  DEFAULT_SETTINGS,
  OrgSettings,
  PayrollItem,
} from '../../types';
import { calculateEmployeePayroll, PayrollAdjustments } from '../../domain/payroll';
import { daysInMonth } from '../../domain/schedule';
import { formatMoneyShort } from '../../utils/format';
import { DataDB } from '../../data/persist';
import { deterministicUuid } from '../../data/id';

export interface MonthComputeInput {
  db: DataDB;
  orgId: string;
  year: number;
  month: number;
}

/**
 * Ayın bordrosunu tüm çalışanlar için hesaplar (PLAN 4.6–4.7).
 * `adjustments`: bordro kalem ekranında girilen prim/ek kesinti/taksit seçimleri.
 * Dönen satırlar henüz kaydedilmemiş "canlı taslak"tır; kesinleştirmede
 * dondurulur.
 */
export async function computePayrollForMonth(
  input: MonthComputeInput,
  adjustments: Record<string, PayrollAdjustments> = {}
): Promise<PayrollItem[]> {
  const { db, orgId, year, month } = input;
  const org = db.organizations.find((o) => o.id === orgId);
  const settings: OrgSettings = org ? { ...DEFAULT_SETTINGS, ...org.settings } : DEFAULT_SETTINGS;
  const schedule = db.schedule_days.filter((s) => s.org_id === orgId);
  const events = db.calendar_events.filter((e) => e.org_id === orgId);
  const departments = db.departments;

  const mm = String(month).padStart(2, '0');
  const monthStart = `${year}-${mm}-01`;
  const lastDay = daysInMonth(year, month);
  const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const active = db.employees.filter((e) => e.org_id === orgId && e.start_date <= monthEnd && (!e.end_date || e.end_date >= monthStart));
  const payrollId = await deterministicUuid(`pay:${orgId}:${year}:${month}`);

  const items: PayrollItem[] = [];
  for (const emp of active) {
    const result = calculateEmployeePayroll({
      employee: emp,
      salaries: db.employee_salaries.filter((s) => s.employee_id === emp.id),
      year,
      month,
      settings,
      schedule,
      events,
      attendance: db.attendance.filter((a) => a.employee_id === emp.id && a.day.startsWith(`${year}-${mm}`)),
      overtime: db.overtime.filter((o) => o.employee_id === emp.id && o.day.startsWith(`${year}-${mm}`)),
      debts: db.debts.filter((d) => d.employee_id === emp.id),
      debtPayments: db.debt_payments.filter((p) => p.employee_id === emp.id),
      adjustments: adjustments[emp.id] ?? {},
    });
    const adj = adjustments[emp.id] ?? {};
    items.push({
      id: await deterministicUuid(`pi:${payrollId}:${emp.id}`),
      org_id: orgId,
      payroll_id: payrollId,
      employee_id: emp.id,
      employee_name: emp.full_name,
      department_name: departments.find((d) => d.id === emp.department_id)?.name ?? null,
      bonus: result.bonus,
      extra_cut: result.extraCut,
      extra_cut_note: adj.extraCutNote ?? null,
      skip_debt: adj.skipDebt ?? false,
      debt_override: adj.debtOverride ?? null,
      base_salary: result.baseSalary,
      hourly_rate: result.hourlyRate,
      absence_cut: result.absenceCut,
      overtime_pay: result.overtimePay,
      debt_cut: result.debtCut,
      net_payable: result.netPayable,
      paid_amount: 0,
      breakdown: {
        hourlyRate: result.breakdown.hourlyRate,
        monthlyHours: result.breakdown.monthlyHours,
        baseSalary: result.breakdown.baseSalary,
        isProRated: result.breakdown.isProRated,
        absenceCut: result.breakdown.absenceCut,
        overtimeHours: result.breakdown.overtimeHours,
        overtimePay: result.breakdown.overtimePay,
        bonus: result.breakdown.bonus,
        extraCut: result.breakdown.extraCut,
        suggestedDebtCut: result.breakdown.suggestedDebtCut,
        debtAllocations: result.breakdown.debtAllocations,
        debtCut: result.breakdown.debtCut,
        uncoveredCut: result.breakdown.uncoveredCut,
        lines: result.breakdown.lines,
      },
      updated_at: new Date().toISOString(),
    });
  }
  return items.sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'tr'));
}

/** Kalem satırı kısa rozetleri: −1 gün · +5 sa mesai · −1.000 taksit */
export function itemBadges(item: PayrollItem): string[] {
  const badges: string[] = [];
  const absenceLines = item.breakdown.lines.filter(
    (l) => l.amount < 0 && !l.label.includes('Avans') && !l.label.includes('Ek Kesinti') && !l.label.includes('Hafta Tatili')
  );
  const fullDays = absenceLines.filter((l) => l.label.startsWith('Gelmedi') || l.label.startsWith('Ücretsiz İzin')).length;
  if (fullDays > 0) badges.push(`−${fullDays} gün`);
  if (item.breakdown.overtimeHours > 0) badges.push(`+${item.breakdown.overtimeHours} sa mesai`);
  if (item.debt_cut > 0) badges.push(`−${formatMoneyShort(item.debt_cut)} taksit`);
  if (item.breakdown.isProRated) badges.push('kıst');
  return badges;
}

export function sumTotals(items: PayrollItem[]) {
  return {
    base: items.reduce((s, i) => s + i.base_salary, 0),
    absence: items.reduce((s, i) => s + i.absence_cut, 0),
    overtime: items.reduce((s, i) => s + i.overtime_pay, 0),
    debt: items.reduce((s, i) => s + i.debt_cut, 0),
    net: items.reduce((s, i) => s + i.net_payable, 0),
    paid: items.reduce((s, i) => s + i.paid_amount, 0),
    uncovered: items.filter((i) => i.breakdown.uncoveredCut > 0),
  };
}
