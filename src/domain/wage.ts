import { CalendarEvent, Employee, EmployeeSalary, HourlyWageMethod, OrgSettings, ScheduleDay } from '../types';
import { averageMonthlyHours, getMonthPlans, standardDayHours } from './schedule';

/**
 * Ücret hesaplama motoru (PLAN.md Bölüm 4.3, 4.6).
 * Tutarlar her kalemde kuruşa yuvarlanır (yarım yukarı).
 */

/** Kuruşa yuvarla (yarım yukarı). −0.005 → −0.00 tutarlılığı için EPSILON eklenir. */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/** Aya uygulanacak aylık saat miktarı (Yöntem A: sabit ortalama, Yöntem B: o ayın gerçek planlı saati) */
export function monthlyHoursFor(method: HourlyWageMethod, schedule: ScheduleDay[], events: CalendarEvent[], year: number, month: number): number {
  if (method === 'gercek_ay') {
    const { totalPlannedHours } = getMonthPlans(year, month, schedule, events);
    return totalPlannedHours > 0 ? totalPlannedHours : averageMonthlyHours(schedule);
  }
  const avg = averageMonthlyHours(schedule);
  return avg > 0 ? avg : 195;
}

/** Verilen günde geçerli maaş (effective_from en yakın olan) */
export function salaryForDay(salaries: EmployeeSalary[], dateStr: string): EmployeeSalary | null {
  if (salaries.length === 0) return null;
  const sorted = [...salaries].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const applicable = sorted.filter((s) => s.effective_from <= dateStr);
  if (applicable.length === 0) return sorted[0];
  return applicable[applicable.length - 1];
}

export interface SalaryPeriod {
  salary: number;
  from: string; // dönem başı (ayın 1'i veya işe giriş veya zam tarihi)
  to: string; // dönem sonu (ayın sonu veya işten çıkış)
  calendarDays: number;
}

/**
 * Ay içindeki maaş dönemlerini çıkarır (ay ortası giriş/çıkış ve zam).
 * Her dönem çalışanın aktif olduğu takvim günlerini kapsar.
 */
export function salaryPeriodsInMonth(
  salaries: EmployeeSalary[],
  employee: Pick<Employee, 'start_date' | 'end_date'>,
  year: number,
  month: number
): SalaryPeriod[] {
  const mm = String(month).padStart(2, '0');
  const monthStart = `${year}-${mm}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const empStart = employee.start_date > monthStart ? employee.start_date : monthStart;
  const empEnd = employee.end_date && employee.end_date < monthEnd ? employee.end_date : monthEnd;
  if (empStart > empEnd) return [];

  // Dönem sınırları: ay başı, işe giriş, işten çıkış, ay sonu + her zam tarihi
  const sorted = [...salaries].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const boundaries = new Set<string>([empStart]);
  for (const s of sorted) {
    if (s.effective_from > empStart && s.effective_from <= empEnd) boundaries.add(s.effective_from);
  }
  const starts = [...boundaries].sort();
  const periods: SalaryPeriod[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? addDaysISOLocal(starts[i + 1], -1) : empEnd;
    if (from > to) continue;
    const salary = salaryForDay(salaries, from)?.amount ?? 0;
    const calendarDays = daysBetweenInclusive(from, to);
    if (calendarDays > 0) periods.push({ salary, from, to, calendarDays });
  }
  return periods;
}

function addDaysISOLocal(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function daysBetweenInclusive(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000) + 1;
}

/**
 * Taban maaş (PLAN 4.6 kıst kuralı).
 * - Ayın tamamında aktif çalışan tam maaşını alır (Şubat dahil); ay ortası zam
 *   varsa dönem günleriyle ağırlıklı maaş çıkar.
 * - Ay içine kısmen denk gelen dönemde: net maaş / 30 × dönemin takvim günü.
 */
export function baseSalaryFromPeriods(periods: SalaryPeriod[], monthLen: number): { base: number; isProRated: boolean; activeDays: number } {
  if (periods.length === 0 || monthLen <= 0) return { base: 0, isProRated: true, activeDays: 0 };
  const totalDays = periods.reduce((s, p) => s + p.calendarDays, 0);
  const fullMonth = totalDays >= monthLen;
  const denom = fullMonth ? monthLen : 30;
  const base = round2(periods.reduce((s, p) => s + (p.salary / denom) * p.calendarDays, 0));
  return { base, isProRated: !fullMonth, activeDays: totalDays };
}

export interface WageContext {
  settings: OrgSettings;
  schedule: ScheduleDay[];
  events: CalendarEvent[];
  year: number;
  month: number;
}

/**
 * Ayın (ve gerekiyorsa günün) saatlik ücretini hesaplar.
 * Zam ay ortasında yapıldıysa her gün kendi dönemünün maaşıyla ücretlenir.
 * Not: oran hesaplamalarda yuvarlanmaz; kuruş yuvarlaması kalem sonucunda
 * yapılır (PLAN 4.3 örneği: 30.000/195 × 9 = 1.384,62 ₺).
 */
export function makeHourlyRateFn(ctx: WageContext, salaries: EmployeeSalary[]) {
  const monthlyHours = monthlyHoursFor(
    ctx.settings.hourlyWageMethod,
    ctx.schedule,
    ctx.events,
    ctx.year,
    ctx.month
  );
  const rateForSalary = (salary: number): number => {
    if (monthlyHours <= 0) return 0;
    return salary / monthlyHours;
  };
  return {
    monthlyHours: round2(monthlyHours),
    forDay: (dateStr: string): number => rateForSalary(salaryForDay(salaries, dateStr)?.amount ?? 0),
    forSalary: rateForSalary,
  };
}

/** Standart tam gün ücreti (hafta tatili kesintisi ve özetler için) */
export function standardDailyRate(hourlyRate: number, schedule: ScheduleDay[]): number {
  return round2(hourlyRate * standardDayHours(schedule));
}
