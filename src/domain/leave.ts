import { Employee, LeaveAdjustment } from '../types';

/**
 * Yıllık izin motoru (PLAN.md Bölüm 4.8, İş Kanunu md. 53).
 * 1–5 yıl 14 gün, 5–15 yıl 20 gün, 15+ yıl 26 gün;
 * 18 yaş altı ve 50 yaş üstüne en az 20 gün (doğum tarihi gerekir).
 */

function yearsBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  let years = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) years -= 1;
  return years;
}

/** Belirli bir hizmet yılının izin hakkı (yaş istisnası o yılın yıldönümünde değerlendirilir) */
export function leaveDaysForYear(startISO: string, birthISO: string | null, yearIndex: number): number {
  if (yearIndex < 1) return 0;
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const anniversary = `${sy + yearIndex}-${String(sm).padStart(2, '0')}-${String(sd).padStart(2, '0')}`;
  let days = yearIndex < 5 ? 14 : yearIndex < 15 ? 20 : 26;
  if (birthISO) {
    const age = yearsBetween(birthISO, anniversary);
    if (age < 18 || age >= 50) days = Math.max(days, 20);
  }
  return days;
}

export interface LeaveStatus {
  /** Bugüne kadar kazanılan toplam izin günü */
  earned: number;
  /** Devreden / elle düzeltmeler (±) */
  adjustment: number;
  /** Kullanılan gün (yıllık izin kayıtları + düşüm) */
  used: number;
  remaining: number;
  /** İlk izin hakkı kazanılana kadar geçen ay */
  monthsToFirstEntitlement: number | null;
}

/**
 * asOf: 'YYYY-MM-DD'. usedDays: puantajdaki yıllık izin gün sayısı.
 */
export function leaveStatus(
  employee: Pick<Employee, 'start_date' | 'birth_date'>,
  adjustments: Pick<LeaveAdjustment, 'days'>[],
  usedDays: number,
  asOf: string
): LeaveStatus {
  const fullYears = yearsBetween(employee.start_date, asOf);
  let earned = 0;
  for (let y = 1; y <= fullYears; y++) {
    earned += leaveDaysForYear(employee.start_date, employee.birth_date, y);
  }
  const adjustment = adjustments.reduce((s, a) => s + a.days, 0);
  const used = usedDays;
  const remaining = Math.max(0, earned + adjustment - used);
  const monthsToFirstEntitlement =
    fullYears < 1 ? Math.max(0, 12 - Math.floor((yearsBetweenExact(employee.start_date, asOf) * 12))) : null;
  return { earned, adjustment, used, remaining, monthsToFirstEntitlement };
}

/** Kesirli yıl (ay hassasiyetinde) — ilk hak edilme sayacı için */
function yearsBetweenExact(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months / 12;
}
