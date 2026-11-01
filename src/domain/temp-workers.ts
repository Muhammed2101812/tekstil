import { TempWorkLog } from '../types';

/**
 * Geçici / Günlük çalışan domain fonksiyonları.
 * UI ve veritabanından bağımsız saf TypeScript.
 */

export function normalizeWorkerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizeWorkerKey(name: string): string {
  return normalizeWorkerName(name).toLocaleLowerCase('tr-TR');
}

/**
 * En son çalışmış benzersiz çalışan isimlerini döner (hızlı seçim chip'leri için).
 */
export function getRecentTempWorkerNames(logs: TempWorkLog[], limit = 6): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const sorted = [...logs].sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });

  for (const log of sorted) {
    const key = normalizeWorkerKey(log.worker_name);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalizeWorkerName(log.worker_name));
      if (result.length >= limit) break;
    }
  }

  return result;
}

/**
 * Belirli bir çalışanın en son kaydındaki varsayılan bilgileri döner (otomatik doldurma için).
 */
export function getLastLogOfWorker(logs: TempWorkLog[], workerName: string): TempWorkLog | null {
  const key = normalizeWorkerKey(workerName);
  const workerLogs = logs
    .filter((l) => normalizeWorkerKey(l.worker_name) === key)
    .sort((a, b) => b.date.localeCompare(a.date));

  return workerLogs[0] ?? null;
}

export interface WorkerGroup {
  workerName: string;
  phone: string | null;
  totalDays: number;
  totalWage: number;
  paidWage: number;
  unpaidWage: number;
  logs: TempWorkLog[];
  lastWorkedDate: string;
}

/**
 * Kayıtları çalışan bazında gruplar ve özetler.
 */
export function groupTempWorkLogsByWorker(logs: TempWorkLog[]): WorkerGroup[] {
  const map = new Map<string, WorkerGroup>();

  for (const log of logs) {
    const key = normalizeWorkerKey(log.worker_name);
    let group = map.get(key);

    if (!group) {
      group = {
        workerName: normalizeWorkerName(log.worker_name),
        phone: log.phone ?? null,
        totalDays: 0,
        totalWage: 0,
        paidWage: 0,
        unpaidWage: 0,
        logs: [],
        lastWorkedDate: log.date,
      };
      map.set(key, group);
    }

    group.totalDays += 1;
    group.totalWage += log.daily_wage || 0;
    if (log.paid) {
      group.paidWage += log.daily_wage || 0;
    } else {
      group.unpaidWage += log.daily_wage || 0;
    }

    if (log.phone && !group.phone) {
      group.phone = log.phone;
    }

    if (log.date > group.lastWorkedDate) {
      group.lastWorkedDate = log.date;
    }

    group.logs.push(log);
  }

  // Her grubun içindeki logları tarihe göre sırala
  for (const group of map.values()) {
    group.logs.sort((a, b) => b.date.localeCompare(a.date));
  }

  // Grupları son çalışma tarihine göre sırala
  return Array.from(map.values()).sort((a, b) => b.lastWorkedDate.localeCompare(a.lastWorkedDate));
}

export interface TempWorkerSummary {
  uniqueWorkersCount: number;
  totalEntriesCount: number;
  totalWage: number;
  paidWage: number;
  unpaidWage: number;
}

/**
 * Genel istatistik özetini hesaplar.
 */
export function calculateTempWorkerSummary(logs: TempWorkLog[]): TempWorkerSummary {
  const uniqueWorkers = new Set<string>();
  let totalWage = 0;
  let paidWage = 0;
  let unpaidWage = 0;

  for (const l of logs) {
    uniqueWorkers.add(normalizeWorkerKey(l.worker_name));
    const wage = l.daily_wage || 0;
    totalWage += wage;
    if (l.paid) {
      paidWage += wage;
    } else {
      unpaidWage += wage;
    }
  }

  return {
    uniqueWorkersCount: uniqueWorkers.size,
    totalEntriesCount: logs.length,
    totalWage,
    paidWage,
    unpaidWage,
  };
}
