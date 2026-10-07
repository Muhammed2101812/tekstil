import { OvertimeRecord } from '../types';
import { round2 } from './wage';

/**
 * Mesai motoru (PLAN.md Bölüm 4.5).
 * Hafta içi / hafta sonu ×1,5, resmî tatil ×2 (ayarlanabilir).
 * Yıllık 270 saat yasal sınırına yaklaşan için uyarı bayrağı üretilir.
 */

export function overtimePay(record: OvertimeRecord, hourlyRate: number, fallbackMultiplier = 1.5): number {
  const mult = record.multiplier ?? fallbackMultiplier;
  return round2(record.hours * hourlyRate * mult);
}

export function overtimeLabel(kind: OvertimeRecord['kind']): string {
  if (kind === 'resmi_tatil') return 'Resmî Tatil Mesaisi';
  if (kind === 'hafta_sonu') return 'Hafta Sonu Ek Çalışma';
  return 'Fazla Mesai';
}

export const LEGAL_YEARLY_OVERTIME_HOURS = 270;

/** Yıl başından bugüne mesai saati + %80 sınır aşımı uyarısı */
export function yearlyOvertimeStatus(records: OvertimeRecord[], year: number): { hours: number; nearLimit: boolean } {
  const hours = round2(records.filter((r) => r.day.startsWith(String(year))).reduce((s, r) => s + r.hours, 0));
  return { hours, nearLimit: hours >= LEGAL_YEARLY_OVERTIME_HOURS * 0.8 };
}
