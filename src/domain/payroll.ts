import {
  AttendanceRecord,
  CalendarEvent,
  Debt,
  DebtPayment,
  DebtAllocation,
  Employee,
  EmployeeSalary,
  OrgSettings,
  OvertimeRecord,
  PayrollBreakdown,
  PayrollBreakdownLine,
  ScheduleDay,
} from '../types';
import { evaluateAttendanceDay } from './attendance';
import { allocateDebtCut, openDebtBalances } from './debts';
import { eventsForEmployee, daysInMonth, getMonthPlans, isoWeekKey, standardDayHours } from './schedule';
import { overtimePay, overtimeLabel } from './overtime';
import { baseSalaryFromPeriods, makeHourlyRateFn, round2, salaryPeriodsInMonth } from './wage';

/**
 * Aylık net maaş hesaplama motoru (PLAN.md Bölüm 4.6).
 *
 *   Hak edilen = taban (kıst/zamlı)
 *    − devamsızlık/kesintiler (gün bazlı ücretle)
 *    + mesai (gün bazlı ücret × çarpan)
 *    + prim − ek kesinti
 *   = ara toplam − taksitler = ÖDENECEK NET
 *
 * Her kalem kuruşa yuvarlanır; toplamlar satırların toplamıdır.
 */

export interface PayrollAdjustments {
  bonus?: number;
  extraCut?: number;
  extraCutNote?: string | null;
  skipDebt?: boolean;
  debtOverride?: number | null;
}

export interface PayrollCalcInput {
  employee: Employee;
  salaries: EmployeeSalary[];
  year: number;
  month: number;
  settings: OrgSettings;
  schedule: ScheduleDay[];
  events: CalendarEvent[];
  attendance: AttendanceRecord[];
  overtime: OvertimeRecord[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  adjustments?: PayrollAdjustments;
}

export interface PayrollCalcResult {
  employeeId: string;
  baseSalary: number;
  hourlyRate: number;
  absenceCut: number;
  overtimeHours: number;
  overtimePay: number;
  bonus: number;
  extraCut: number;
  suggestedDebtCut: number;
  debtAllocations: DebtAllocation[];
  debtCut: number;
  netPayable: number;
  uncoveredCut: number;
  warning?: string | null;
  breakdown: PayrollBreakdown;
}

export function calculateEmployeePayroll(input: PayrollCalcInput): PayrollCalcResult {
  const {
    employee,
    salaries,
    year,
    month,
    settings,
    schedule,
    events,
    attendance,
    overtime,
    debts,
    debtPayments,
    adjustments = {},
  } = input;
  const { bonus = 0, extraCut = 0, extraCutNote = null, skipDebt = false, debtOverride = null } = adjustments;

  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const monthLen = daysInMonth(year, month);
  const empEvents = eventsForEmployee(events, employee);
  const monthPlans = getMonthPlans(year, month, schedule, empEvents);

  // 1. Taban maaş (kıst + ay ortası zam)
  const periods = salaryPeriodsInMonth(salaries, employee, year, month);
  const base = baseSalaryFromPeriods(periods, monthLen);

  // 2. Gün bazlı saatlik ücret
  const rate = makeHourlyRateFn({ settings, schedule, events: empEvents, year, month }, salaries);

  const lines: PayrollBreakdownLine[] = [];
  lines.push({
    label: 'Taban Net Maaş',
    amount: base.base,
    detail: base.isProRated
      ? `Kıst: ayın ${base.activeDays} takvim günü aktifti (maaş/30 × gün)`
      : `Saatlik ${rate.forDay(`${ym}-01`).toFixed(2)} ₺ × ${rate.monthlyHours} saat`,
  });

  // 3. Gün gün puantaj değerlendirmesi
  const byDay = new Map(attendance.map((a) => [a.day, a]));
  let absenceCut = 0;
  let overtimeHours = 0;
  let overtimePayTotal = 0;
  const unexcusedWeeks = new Set<string>();

  // Rapor ilk 2 gün işveren öder: ardışık rapor koşularını takip et
  let raporRunIndex = 0;
  let prevDayRapor = false;

  for (const plan of monthPlans.days) {
    const active = plan.date >= employee.start_date && (!employee.end_date || plan.date <= employee.end_date);
    if (!active) {
      prevDayRapor = false;
      continue;
    }

    // Ücretsiz firma tatili: otomatik kesinti (yoklama gerektirmez)
    if (plan.kind === 'firma_tatili_ucretsiz') {
      const dayRate = rate.forDay(plan.date);
      const cut = round2(plan.plannedHours * dayRate);
      if (cut > 0) {
        absenceCut = round2(absenceCut + cut);
        lines.push({
          label: `Firma Tatili — ${plan.title ?? 'ücretsiz'} (${plan.date.slice(8)}.${plan.date.slice(5, 7)})`,
          amount: -cut,
          detail: `${plan.plannedHours} saat × ${dayRate.toFixed(2)} ₺`,
        });
      }
      prevDayRapor = false;
      continue;
    }

    // O14: Hafta sonu / tatil günlerinde prevDayRapor = false yapılarak rapor koşusu hafta sonunda bölünür.
    // Mevcut iş kuralı davranışı gereği korunmuştur (Cuma rapor + Pzt rapor, 2 ayrı tek günlük rapor gibi ele alınır).
    if (!plan.isWorkday) {
      prevDayRapor = false;
      continue;
    }

    const record = byDay.get(plan.date);
    const dayRate = rate.forDay(plan.date);

    let raporEmployerPaid = false;
    if (settings.sickLeaveFirstTwoDaysEmployer && record?.status === 'rapor') {
      raporRunIndex = prevDayRapor ? raporRunIndex + 1 : 1;
      raporEmployerPaid = raporRunIndex <= 2;
    }
    prevDayRapor = record?.status === 'rapor' && settings.sickLeaveFirstTwoDaysEmployer;

    const impact = evaluateAttendanceDay(record, plan, dayRate, settings, { raporEmployerPaid });
    if (impact.deduction > 0) {
      absenceCut = round2(absenceCut + impact.deduction);
      const statusLabels: Record<string, string> = {
        gelmedi: 'Gelmedi',
        gec_geldi: 'Geç Geldi',
        erken_cikti: 'Erken Çıktı',
        yarim_gun: 'Yarım Gün',
        ucretsiz_izin: 'Ücretsiz İzin',
        rapor: 'Raporlu',
      };
      lines.push({
        label: `${statusLabels[impact.status] ?? impact.status} (${plan.date.slice(8)}.${plan.date.slice(5, 7)})`,
        amount: -impact.deduction,
        detail: impact.description,
      });
    }
    if (impact.isUnexcused) unexcusedWeeks.add(isoWeekKey(plan.date));
  }

  // 4. Hafta tatili kesintisi (isteğe bağlı, varsayılan kapalı)
  if (settings.weekRestPenalty && unexcusedWeeks.size > 0) {
    const dayRate = rate.forDay(`${ym}-15`);
    const restCut = round2(dayRate * standardDayHours(schedule));
    const total = round2(restCut * unexcusedWeeks.size);
    absenceCut = round2(absenceCut + total);
    lines.push({
      label: 'Hafta Tatili Kesintisi',
      amount: -total,
      detail: `${unexcusedWeeks.size} hafta mazeretsiz devamsızlık × ${restCut.toFixed(2)} ₺`,
    });
  }

  // 5. Mesai
  const monthOvertime = overtime.filter((o) => o.day.startsWith(ym));
  for (const ot of monthOvertime) {
    const dayRate = rate.forDay(ot.day);
    const fallback = ot.kind === 'resmi_tatil' ? settings.holidayOvertimeMultiplier : settings.overtimeMultiplier;
    const pay = overtimePay({ ...ot, multiplier: ot.multiplier ?? fallback }, dayRate);
    overtimeHours = round2(overtimeHours + ot.hours);
    overtimePayTotal = round2(overtimePayTotal + pay);
    lines.push({
      label: `${overtimeLabel(ot.kind)} (${ot.day.slice(8)}.${ot.day.slice(5, 7)})`,
      amount: pay,
      detail: `${ot.hours} saat × ${dayRate.toFixed(2)} ₺ × ${(ot.multiplier ?? fallback).toString().replace('.', ',')} = +${pay.toFixed(2)} ₺`,
    });
  }

  // 6. Prim / ek kesinti
  const bonusR = round2(bonus);
  const extraCutR = round2(extraCut);
  if (bonusR > 0) lines.push({ label: 'Prim / İkramiye', amount: bonusR, detail: 'Elle eklendi' });
  if (extraCutR > 0) {
    lines.push({ label: 'Ek Kesinti', amount: -extraCutR, detail: extraCutNote || 'Elle eklendi' });
  }

  // 7. Ara toplam ve taksit dağıtımı
  const subtotal = round2(base.base - absenceCut + overtimePayTotal + bonusR - extraCutR);
  const openBalances = openDebtBalances(debts, debtPayments, ym);
  const suggestedTotal = round2(openBalances.reduce((s, b) => s + b.suggestedInstallment, 0));

  let allocations: DebtAllocation[] = [];
  let debtCut = 0;
  if (!skipDebt) {
    const openRemaining = round2(openBalances.reduce((s, b) => s + b.remaining, 0));
    if (debtOverride !== null && debtOverride !== undefined) {
      const wanted = round2(Math.min(Math.max(0, debtOverride), openRemaining));
      const dist = allocateDebtCut(debts, debtPayments, ym, wanted, { allowAboveSuggested: true });
      allocations = dist.allocations;
      debtCut = dist.allocatedTotal;
    } else {
      const dist = allocateDebtCut(debts, debtPayments, ym, Math.max(0, subtotal));
      allocations = dist.allocations;
      debtCut = dist.allocatedTotal;
    }
  }
  if (debtCut > 0) {
    lines.push({
      label: 'Avans / Borç Taksiti',
      amount: -debtCut,
      detail: allocations.map((a) => `${a.amount.toFixed(2)} ₺`).join(' + '),
    });
  }

  const netPayable = round2(Math.max(0, subtotal - debtCut));
  const uncoveredCut = round2(Math.max(0, -(subtotal - debtCut)));

  const breakdown: PayrollBreakdown = {
    hourlyRate: round2(rate.forDay(`${ym}-15`)),
    monthlyHours: rate.monthlyHours,
    baseSalary: base.base,
    isProRated: base.isProRated,
    absenceCut,
    overtimeHours,
    overtimePay: overtimePayTotal,
    bonus: bonusR,
    extraCut: extraCutR,
    suggestedDebtCut: suggestedTotal,
    debtAllocations: allocations,
    debtCut,
    uncoveredCut,
    lines,
    warning: salaries.length === 0 ? 'Maaş kaydı bulunamadı' : null,
  };

  return {
    employeeId: employee.id,
    baseSalary: base.base,
    hourlyRate: round2(rate.forDay(`${ym}-15`)),
    absenceCut,
    overtimeHours,
    overtimePay: overtimePayTotal,
    bonus: bonusR,
    extraCut: extraCutR,
    suggestedDebtCut: suggestedTotal,
    debtAllocations: allocations,
    debtCut,
    netPayable,
    uncoveredCut,
    warning: salaries.length === 0 ? 'Maaş kaydı bulunamadı' : null,
    breakdown,
  };
}
