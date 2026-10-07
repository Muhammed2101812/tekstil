import { BreakTime, CalendarEvent, Employee, ScheduleDay } from '../types';

/**
 * Çalışma takvimi motoru (PLAN.md Bölüm 4.1–4.2).
 * Saf TypeScript — arayüzden ve veritabanından bağımsız.
 */

export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Bir saat aralığı içinde kalan ücretsiz mola dakikaları (yarım gün desteği) */
export function unpaidBreakMinutesWithin(startStr: string, endStr: string, breaks: BreakTime[]): number {
  const start = timeToMinutes(startStr);
  const end = timeToMinutes(endStr);
  return breaks.reduce((sum, b) => {
    if (b.paid) return sum;
    const bs = timeToMinutes(b.start);
    const be = timeToMinutes(b.end);
    const overlap = Math.min(end, be) - Math.max(start, bs);
    return sum + Math.max(0, overlap);
  }, 0);
}

/** startTime–endTime arasının ücretsiz molalar düşülmüş net saat miktarı */
export function netHoursBetween(startStr: string, endStr: string, breaks: BreakTime[]): number {
  const gross = timeToMinutes(endStr) - timeToMinutes(startStr);
  const unpaid = unpaidBreakMinutesWithin(startStr, endStr, breaks);
  return Math.max(0, gross - unpaid) / 60;
}

export function dayNetHours(day: ScheduleDay): number {
  if (!day.is_workday) return 0;
  return netHoursBetween(day.start_time, day.end_time, day.breaks);
}

export function weeklyPlannedHours(schedule: ScheduleDay[]): number {
  return schedule.reduce((sum, d) => sum + dayNetHours(d), 0);
}

/** Yöntem A: haftalık saat × 52 / 12 (örn. 45 × 52 / 12 = 195) */
export function averageMonthlyHours(schedule: ScheduleDay[]): number {
  return (weeklyPlannedHours(schedule) * 52) / 12;
}

/** ISO tarih dizgisinden haftanın günü: 1 = Pazartesi … 7 = Pazar */
export function getWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Pazar
  return jsDay === 0 ? 7 : jsDay;
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Ayın gün sayısı */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type DayPlanKind =
  | 'normal'
  | 'resmi_tatil'
  | 'yarim_gun'
  | 'firma_tatili_ucretli'
  | 'firma_tatili_ucretsiz'
  | 'ek_calisma';

export interface DayPlan {
  date: string;
  kind: DayPlanKind;
  /** O gün çalışılması planlanan net saat (kesinti ve mesai hesabının temeli) */
  plannedHours: number;
  /** İş günü mü? (false = gelmeyenlerden kesinti yapılmaz) */
  isWorkday: boolean;
  /** Ek çalışma / resmî tatil çalışması çarpanı */
  overtimeMultiplier: number | null;
  title: string | null;
  event: CalendarEvent | null;
  /** Planlı başlangıç/bitiş (dakika; gecikme–erken çıkış hesabı için) */
  startMinutes: number | null;
  endMinutes: number | null;
}

function planFor(
  date: string,
  kind: DayPlanKind,
  plannedHours: number,
  isWorkday: boolean,
  overtimeMultiplier: number | null,
  title: string | null,
  event: CalendarEvent | null,
  startMinutes: number | null,
  endMinutes: number | null
): DayPlan {
  return { date, kind, plannedHours, isWorkday, overtimeMultiplier, title, event, startMinutes, endMinutes };
}

/**
 * Bir günün planını çözer. Öncelik: resmî tatil > firma tatili > yarım gün > ek
 * çalışma > haftalık takvim. Resmî tatil + ek çalışma aynı günde olabilir
 * (çarpan ek çalışmanın multipler'ı ile, örn. ×2).
 */
export function getDayPlan(dateStr: string, schedule: ScheduleDay[], events: CalendarEvent[]): DayPlan {
  const weekday = getWeekday(dateStr);
  const day = schedule.find((s) => s.weekday === weekday);
  const defaultHours = day ? dayNetHours(day) : 0;
  const dayStart = day ? timeToMinutes(day.start_time) : null;
  const dayEnd = day ? timeToMinutes(day.end_time) : null;
  const dayEvents = events.filter((e) => e.date === dateStr);

  const holiday = dayEvents.find((e) => e.type === 'resmi_tatil');
  const firmaTatili = dayEvents.find((e) => e.type === 'firma_tatili');
  const yarimGun = dayEvents.find((e) => e.type === 'yarim_gun');
  const ekCalisma = dayEvents.find((e) => e.type === 'ek_calisma');

  if (holiday) {
    if (ekCalisma) {
      const start = ekCalisma.start_time ?? day?.start_time ?? '08:00';
      const end = ekCalisma.end_time ?? day?.end_time ?? '13:00';
      const h = netHoursBetween(start, end, day?.breaks ?? []);
      return planFor(dateStr, 'ek_calisma', h, false, ekCalisma.multiplier ?? 2.0, ekCalisma.title ?? holiday.title, ekCalisma, timeToMinutes(start), timeToMinutes(end));
    }
    return planFor(dateStr, 'resmi_tatil', 0, false, holiday.multiplier ?? 2.0, holiday.title, holiday, dayStart, dayEnd);
  }

  if (firmaTatili) {
    if (firmaTatili.paid) {
      return planFor(dateStr, 'firma_tatili_ucretli', 0, false, null, firmaTatili.title, firmaTatili, dayStart, dayEnd);
    }
    // Ücretsiz firma tatili: herkesten o günün planlı süresi kadar kesilir.
    return planFor(dateStr, 'firma_tatili_ucretsiz', defaultHours, true, null, firmaTatili.title, firmaTatili, dayStart, dayEnd);
  }

  if (yarimGun) {
    const start = yarimGun.start_time ?? day?.start_time ?? '08:00';
    const end = yarimGun.end_time ?? day?.end_time ?? '13:00';
    const h = netHoursBetween(start, end, day?.breaks ?? []);
    return planFor(dateStr, 'yarim_gun', h, true, null, yarimGun.title, yarimGun, timeToMinutes(start), timeToMinutes(end));
  }

  if (ekCalisma) {
    const start = ekCalisma.start_time ?? day?.start_time ?? '08:00';
    const end = ekCalisma.end_time ?? day?.end_time ?? '13:00';
    const h = netHoursBetween(start, end, day?.breaks ?? []);
    return planFor(dateStr, 'ek_calisma', h, false, ekCalisma.multiplier ?? 1.5, ekCalisma.title, ekCalisma, timeToMinutes(start), timeToMinutes(end));
  }

  return planFor(dateStr, 'normal', defaultHours, day?.is_workday ?? false, null, null, null, dayStart, dayEnd);
}

export interface MonthPlans {
  days: DayPlan[];
  /** İş günlerinin planlı saati toplamı (Yöntem B için) */
  totalPlannedHours: number;
  totalWorkdays: number;
}

export function getMonthPlans(year: number, month: number, schedule: ScheduleDay[], events: CalendarEvent[]): MonthPlans {
  const total = daysInMonth(year, month);
  const days: DayPlan[] = [];
  let totalPlannedHours = 0;
  let totalWorkdays = 0;
  for (let d = 1; d <= total; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const plan = getDayPlan(dateStr, schedule, events);
    days.push(plan);
    if (plan.isWorkday) {
      totalPlannedHours += plan.plannedHours;
      totalWorkdays += 1;
    }
  }
  return { days, totalPlannedHours, totalWorkdays };
}

/** ISO hafta anahtarı: '2026-W40' (hafta tatili kesintisi için) */
export function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Pazartesi = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Perşembe'yi taşı
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Standart bir tam iş gününün saati (ilk iş gününden; yoksa 9) */
export function standardDayHours(schedule: ScheduleDay[]): number {
  const firstWorkday = schedule.find((d) => d.is_workday && dayNetHours(d) > 0);
  return firstWorkday ? dayNetHours(firstWorkday) : 9;
}

/** Ek çalışma kapsamını çalışana göre süzer; diğer olaylar herkese uygulanır */
export function eventsForEmployee(
  events: CalendarEvent[],
  employee: Pick<Employee, 'id' | 'department_id'>
): CalendarEvent[] {
  return events.filter((e) => {
    if (e.type !== 'ek_calisma') return true;
    if (e.scope === 'tumu') return true;
    if (e.scope === 'departman') return !!employee.department_id && e.department_id === employee.department_id;
    return e.employee_ids.includes(employee.id);
  });
}

/**
 * Ek çalışma gününün planlanabilirliğini kontrol eder (M2 kuralı).
 * Ek çalışma yalnızca tatil / hafta sonu günlerine (iş günü olmayan veya özel tatil günlerine) planlanabilir.
 * Normal bir iş gününe ek çalışma eklenemez.
 */
export function validateEkCalismaDate(dayPlan: Pick<DayPlan, 'isWorkday' | 'kind'>): { valid: boolean; error?: string } {
  if (dayPlan.isWorkday && dayPlan.kind === 'normal') {
    return {
      valid: false,
      error: 'Bu tarih zaten iş günü; ek çalışma yalnızca tatil günlerine tanımlanır',
    };
  }
  return { valid: true };
}
