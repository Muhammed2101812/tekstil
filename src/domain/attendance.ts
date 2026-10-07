import { AttendanceRecord, AttendanceStatus, OrgSettings } from '../types';
import { DayPlan , timeToMinutes } from './schedule';
import { round2 } from './wage';

/**
 * Puantaj durumu → maaş etkisi (PLAN.md Bölüm 4.4).
 * Geç kalma varsayılan olarak sadece kayıttır; devamsızlık günün planlı saati
 * üzerinden kesilir; tatil günlerinde kesinti yoktur.
 */

export interface AttendanceDayImpact {
  status: AttendanceStatus;
  /** Kaçırılan planlı saat (raporlama için; kesintiyle birebir aynı olmayabilir) */
  missedHours: number;
  /** Kuruşa yuvarlanmış kesinti tutarı */
  deduction: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  /** Mazeretsiz devamsızlık (hafta tatili kesintisi tetikler) */
  isUnexcused: boolean;
  /** "Gelmedi" sayılan tam gün (devamsızlık istatistiği) */
  isFullAbsence: boolean;
  description: string;
}

const NO_IMPACT = (status: AttendanceStatus, description: string): AttendanceDayImpact => ({
  status,
  missedHours: 0,
  deduction: 0,
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  isUnexcused: false,
  isFullAbsence: false,
  description,
});

/** Gecikme: kayıtlı dakika yoksa geliş saati − planlı başlangıçtan hesaplanır */
function effectiveLateMinutes(record: AttendanceRecord, plan: DayPlan): number {
  if (record.late_minutes > 0) return record.late_minutes;
  if (record.arrival_time && plan.startMinutes !== null) {
    const mins = timeToMinutes(record.arrival_time) - plan.startMinutes;
    return Math.max(0, mins);
  }
  return 0;
}

/** Erken çıkış: kayıtlı dakika yoksa planlı bitiş − çıkış saatinden hesaplanır */
function effectiveEarlyMinutes(record: AttendanceRecord, plan: DayPlan): number {
  if (record.early_leave_minutes > 0) return record.early_leave_minutes;
  if (record.leave_time && plan.endMinutes !== null) {
    return Math.max(0, plan.endMinutes - timeToMinutes(record.leave_time));
  }
  return 0;
}

/**
 * Bir günün puantaj kaydını değerlendirir. `hourlyRate` o GÜNÜN ücretidir
 * (ay ortası zamda güne göre değişir).
 */
export function evaluateAttendanceDay(
  record: AttendanceRecord | undefined,
  plan: DayPlan,
  hourlyRate: number,
  settings: OrgSettings,
  opts: { raporEmployerPaid?: boolean } = {}
): AttendanceDayImpact {
  // Kayıt yoksa iş gününde "Geldi" varsayılanı (Bölüm 4.4)
  if (!record || record.status === 'geldi') {
    return NO_IMPACT('geldi', 'Tam gün çalıştı');
  }

  // Tatil ve ek çalışma günlerinde iş günü kesintisi olmaz
  if (!plan.isWorkday) {
    return NO_IMPACT(record.status, 'Tatil / ek çalışma günü (kesinti yok)');
  }

  const planned = plan.plannedHours;
  const raporEmployerPaid = opts.raporEmployerPaid ?? false;

  switch (record.status) {
    case 'gelmedi': {
      const deduction = round2(planned * hourlyRate);
      return {
        status: 'gelmedi',
        missedHours: planned,
        deduction,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        isUnexcused: true,
        isFullAbsence: true,
        description: `${planned} saat × ${hourlyRate.toFixed(2)} ₺ = −${deduction.toFixed(2)} ₺`,
      };
    }

    case 'gec_geldi': {
      const late = effectiveLateMinutes(record, plan);
      if (settings.deductLate && late > 0) {
        const deduction = round2((late / 60) * hourlyRate);
        return {
          status: 'gec_geldi',
          missedHours: round2(late / 60),
          deduction,
          lateMinutes: late,
          earlyLeaveMinutes: 0,
          isUnexcused: false,
          isFullAbsence: false,
          description: `${late} dk geç × ${hourlyRate.toFixed(2)} ₺/sa = −${deduction.toFixed(2)} ₺`,
        };
      }
      return {
        status: 'gec_geldi',
        missedHours: 0,
        deduction: 0,
        lateMinutes: late,
        earlyLeaveMinutes: 0,
        isUnexcused: false,
        isFullAbsence: false,
        description: `${late} dk geç geldi (kayıt, kesinti yok)`,
      };
    }

    case 'erken_cikti': {
      const early = effectiveEarlyMinutes(record, plan);
      const missed = round2(early / 60);
      if (settings.deductEarlyLeave && missed > 0) {
        const deduction = round2(missed * hourlyRate);
        return {
          status: 'erken_cikti',
          missedHours: missed,
          deduction,
          lateMinutes: 0,
          earlyLeaveMinutes: early,
          isUnexcused: false,
          isFullAbsence: false,
          description: `${early} dk erken × ${hourlyRate.toFixed(2)} ₺/sa = −${deduction.toFixed(2)} ₺`,
        };
      }
      return {
        status: 'erken_cikti',
        missedHours: missed,
        deduction: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: early,
        isUnexcused: false,
        isFullAbsence: false,
        description: `${early} dk erken çıktı (kesinti yok)`,
      };
    }

    case 'yarim_gun': {
      const half = round2(planned / 2);
      const deduction = round2(half * hourlyRate);
      return {
        status: 'yarim_gun',
        missedHours: half,
        deduction,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        isUnexcused: false,
        isFullAbsence: false,
        description: `Yarım gün (${half} saat × ${hourlyRate.toFixed(2)} ₺ = −${deduction.toFixed(2)} ₺)`,
      };
    }

    case 'yillik_izin':
      return NO_IMPACT('yillik_izin', 'Yıllık izin (ücretli, bakiyeden düşer)');

    case 'mazeret_izni':
      return NO_IMPACT('mazeret_izni', 'Mazeret izni (ücretli)');

    case 'ucretsiz_izin': {
      const deduction = round2(planned * hourlyRate);
      return {
        status: 'ucretsiz_izin',
        missedHours: planned,
        deduction,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        isUnexcused: false,
        isFullAbsence: true,
        description: `Ücretsiz izin (${planned} saat × ${hourlyRate.toFixed(2)} ₺ = −${deduction.toFixed(2)} ₺)`,
      };
    }

    case 'rapor': {
      if (!settings.deductSickLeave || raporEmployerPaid) {
        return NO_IMPACT('rapor', 'Raporlu (maaştan kesilmedi)');
      }
      const deduction = round2(planned * hourlyRate);
      return {
        status: 'rapor',
        missedHours: planned,
        deduction,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        isUnexcused: false,
        isFullAbsence: true,
        description: `Raporlu (${planned} saat kesildi: −${deduction.toFixed(2)} ₺)`,
      };
    }
  }
}

/** Bir aydaki puantaj özet sayıları (ekran üstü rozetleri) */
export function summarizeAttendance(records: AttendanceRecord[], employeeIds: string[]) {
  const byStatus = new Map<AttendanceStatus, number>();
  let recorded = 0;
  for (const r of records) {
    if (!employeeIds.includes(r.employee_id)) continue;
    recorded += 1;
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  }
  return { recorded, byStatus };
}
