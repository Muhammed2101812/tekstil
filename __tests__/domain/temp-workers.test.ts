import {
  normalizeWorkerName,
  normalizeWorkerKey,
  getRecentTempWorkerNames,
  getLastLogOfWorker,
  groupTempWorkLogsByWorker,
  calculateTempWorkerSummary,
} from '../../src/domain/temp-workers';
import { TempWorkLog } from '../../src/types';

describe('temp-workers domain', () => {
  const mockLogs: TempWorkLog[] = [
    {
      id: '1',
      org_id: 'org1',
      worker_name: 'Ahmet Yılmaz',
      phone: '05551112233',
      date: '2026-10-20',
      duration_type: 'tam_gun',
      hours: null,
      task_description: 'Paketleme',
      daily_wage: 1000,
      paid: true,
      paid_at: '2026-10-20',
      payment_method: 'nakit',
      note: 'İyi çalıştı',
      created_at: '2026-10-20T10:00:00Z',
    },
    {
      id: '2',
      org_id: 'org1',
      worker_name: 'ahmet yılmaz',
      phone: '05551112233',
      date: '2026-10-21',
      duration_type: 'tam_gun',
      hours: null,
      task_description: 'Paketleme',
      daily_wage: 1000,
      paid: false,
      paid_at: null,
      payment_method: null,
      note: null,
      created_at: '2026-10-21T10:00:00Z',
    },
    {
      id: '3',
      org_id: 'org1',
      worker_name: 'Mehmet Demir',
      phone: null,
      date: '2026-10-22',
      duration_type: 'yarim_gun',
      hours: null,
      task_description: 'İplik Temizleme',
      daily_wage: 600,
      paid: false,
      paid_at: null,
      payment_method: null,
      note: null,
      created_at: '2026-10-22T10:00:00Z',
    },
  ];

  it('normalizes worker name and key consistently', () => {
    expect(normalizeWorkerName('  Ahmet   Yılmaz  ')).toBe('Ahmet Yılmaz');
    expect(normalizeWorkerKey('İSMAİL KAYA')).toBe('ismail kaya');
  });

  it('extracts unique recent worker names in descending date order', () => {
    const recent = getRecentTempWorkerNames(mockLogs);
    expect(recent).toEqual(['Mehmet Demir', 'ahmet yılmaz']);
  });

  it('gets last log of a specific worker case-insensitively', () => {
    const last = getLastLogOfWorker(mockLogs, 'AHMET YILMAZ');
    expect(last?.id).toBe('2');
    expect(last?.date).toBe('2026-10-21');
  });

  it('groups logs by worker and calculates totals accurately', () => {
    const groups = groupTempWorkLogsByWorker(mockLogs);
    expect(groups).toHaveLength(2);

    const ahmet = groups.find((g) => normalizeWorkerKey(g.workerName) === 'ahmet yılmaz');
    expect(ahmet).toBeDefined();
    expect(ahmet?.totalDays).toBe(2);
    expect(ahmet?.totalWage).toBe(2000);
    expect(ahmet?.paidWage).toBe(1000);
    expect(ahmet?.unpaidWage).toBe(1000);
  });

  it('calculates total summary correctly', () => {
    const summary = calculateTempWorkerSummary(mockLogs);
    expect(summary.uniqueWorkersCount).toBe(2);
    expect(summary.totalEntriesCount).toBe(3);
    expect(summary.totalWage).toBe(2600);
    expect(summary.paidWage).toBe(1000);
    expect(summary.unpaidWage).toBe(1600);
  });
});
