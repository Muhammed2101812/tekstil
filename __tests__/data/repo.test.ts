import { useDataStore, emptyDB } from '../../src/data/store';
import {
  addEmployee,
  markAttendance,
  giveDebt,
  recordDebtPayment,
  deleteDebtIfUnpaid,
  ensureHolidays,
  ensurePayroll,
  finalizePayroll,
} from '../../src/data/repo';
import { remoteUpsert, remoteDelete, mergeRowsById } from '../../src/data/supabase';
import { validateEkCalismaDate } from '../../src/domain/schedule';

/**
 * Veri katmanı testleri — tamamen online mimari (agent.md):
 * remote-first yazma kuralı (önce Supabase, başarıda store), idempotent upsert,
 * bordro kesinleştirme aynası. Supabase istemcisi bellek içi sahte ile değiştirilir.
 */

// Bellek içi sahte Supabase: satırlar Map'te tutulur, hata bayrakları test edilir.
const mockDb = {
  rows: new Map<string, Record<string, unknown>[]>(),
  failUpsert: false as string | false,
  failDelete: false as string | false,
  rpcError: null as string | null,
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      upsert: async (rows: Record<string, unknown>[]) => {
        if (mockDb.failUpsert) return { error: { message: mockDb.failUpsert as string } };
        const cur = mockDb.rows.get(table) ?? [];
        for (const r of rows) {
          const i = cur.findIndex((x) => x.id === r.id);
          if (i >= 0) cur[i] = r;
          else cur.push(r);
        }
        mockDb.rows.set(table, cur);
        return { error: null };
      },
      delete: () => ({
        in: async (_col: string, ids: string[]) => {
          if (mockDb.failDelete) return { error: { message: mockDb.failDelete as string } };
          const cur = mockDb.rows.get(table) ?? [];
          mockDb.rows.set(table, cur.filter((r) => !ids.includes(r.id as string)));
          return { error: null };
        },
      }),
      select: () => {
        // Hem doğrudan await edilebilir hem de .eq/.gt zincirlenebilir thenable
        const res: Record<string, unknown> = {
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: [...(mockDb.rows.get(table) ?? [])], error: null }),
        };
        res.eq = async () => ({ data: mockDb.rows.get(table) ?? [], error: null });
        res.gt = async () => ({ data: [], error: null });
        return res;
      },
    }),
    rpc: async (name: string) => {
      if (mockDb.rpcError) return { data: null, error: { message: mockDb.rpcError } };
      if (name === 'create_organization') return { data: 'org-test', error: null };
      return { data: null, error: null };
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signOut: async () => ({}),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

beforeEach(() => {
  mockDb.rows.clear();
  mockDb.failUpsert = false;
  mockDb.failDelete = false;
  mockDb.rpcError = null;
  const st = useDataStore.getState();
  st.replaceDB(emptyDB());
  st.init('user-1', 'org-test');
});

describe('Remote-first yazma kuralı (agent.md)', () => {
  test('remoteUpsert: önce sunucu, başarıda store güncellenir', async () => {
    const dep = { id: 'dep-1', org_id: 'org-test', name: 'Dikim', color: '#fff', sort_order: 0, updated_at: '2026-01-01' };
    await remoteUpsert('departments', dep);
    expect(mockDb.rows.get('departments')).toHaveLength(1);
    expect(useDataStore.getState().db.departments).toHaveLength(1);
  });

  test('remoteUpsert: sunucu reddederse store’a dokunulmaz ve hata fırlar', async () => {
    mockDb.failUpsert = 'RLS reddetti';
    const dep = { id: 'dep-1', org_id: 'org-test', name: 'Dikim', color: '#fff', sort_order: 0, updated_at: '2026-01-01' };
    await expect(remoteUpsert('departments', dep)).rejects.toThrow('RLS reddetti');
    expect(useDataStore.getState().db.departments).toHaveLength(0);
  });

  test('remoteDelete: sunucu başarılıysa store’dan düşer; hataysa düşmez', async () => {
    const dep = { id: 'dep-1', org_id: 'org-test', name: 'Dikim', color: '#fff', sort_order: 0, updated_at: '2026-01-01' };
    await remoteUpsert('departments', dep);

    mockDb.failDelete = 'DELETE yalnız firma sahibine açık';
    await expect(remoteDelete('departments', ['dep-1'])).rejects.toThrow('firma sahibine açık');
    expect(useDataStore.getState().db.departments).toHaveLength(1);

    mockDb.failDelete = false;
    await remoteDelete('departments', ['dep-1']);
    expect(useDataStore.getState().db.departments).toHaveLength(0);
  });

  test('markAttendance idempotent: aynı çalışan+gün tek satır, aynı id', async () => {
    const emp = await addEmployee({ full_name: 'Ayşe Yılmaz', salary: 30000, start_date: '2026-01-01' });

    await markAttendance('2026-11-12', [{ employee_id: emp.id, status: 'gelmedi' }]);
    const first = useDataStore.getState().db.attendance.filter((a) => a.employee_id === emp.id);
    expect(first).toHaveLength(1);

    await markAttendance('2026-11-12', [{ employee_id: emp.id, status: 'gelmedi' }]);
    const second = useDataStore.getState().db.attendance.filter((a) => a.employee_id === emp.id);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(mockDb.rows.get('attendance')).toHaveLength(1);
  });
});

describe('Borç silme koruması', () => {
  test('Ödemesi olan borç silinemez; elden ödeme kalanı düşürür', async () => {
    const emp = await addEmployee({ full_name: 'Fatma Demir', salary: 28000, start_date: '2026-01-01' });
    const d = await giveDebt({ employee_id: emp.id, amount: 3000, type: 'avans', installments: 1, start_month: '2026-12' });

    const sil = await deleteDebtIfUnpaid(d);
    expect(sil.ok).toBe(true);

    const d2 = await giveDebt({ employee_id: emp.id, amount: 3000, type: 'avans', installments: 1, start_month: '2026-12' });
    await recordDebtPayment({ debt_id: d2, employee_id: emp.id, amount: 1000, method: 'elden' });
    const sil2 = await deleteDebtIfUnpaid(d2);
    expect(sil2.ok).toBe(false);
    expect(
      useDataStore.getState().db.debt_payments.filter((p) => p.debt_id === d2).reduce((s, p) => s + p.amount, 0)
    ).toBe(1000);
  });
});

describe('M3: ensureHolidays — yıl devrinde tatil tohumlama', () => {
  test('Eksik yıl tohumlanır, ikinci çağrı çoğaltmaz (idempotent)', async () => {
    const count = await ensureHolidays('org-test', 2029);
    expect(count).toBeGreaterThan(10);
    expect(useDataStore.getState().db.calendar_events.filter((e) => e.date.startsWith('2029-'))).toHaveLength(count);

    const secondCall = await ensureHolidays('org-test', 2029);
    expect(secondCall).toBe(0);

    const outOfRange = await ensureHolidays('org-test', 2035);
    expect(outOfRange).toBe(0);
  });
});

describe('Bordro: RPC başarısızsa yerel aynalama olmaz', () => {
  test('finalizePayroll RPC hatası fırlatır ve bordro taslakta kalır', async () => {
    const emp = await addEmployee({ full_name: 'Mehmet Kaya', salary: 30000, start_date: '2026-01-01' });
    const payroll = await ensurePayroll(2026, 11);

    mockDb.rpcError = 'Bordro zaten kesinleşmiş';
    await expect(
      finalizePayroll(payroll.id, [
        {
          id: 'item-1',
          org_id: 'org-test',
          payroll_id: payroll.id,
          employee_id: emp.id,
          employee_name: 'Mehmet Kaya',
          department_name: null,
          bonus: 0,
          extra_cut: 0,
          extra_cut_note: null,
          skip_debt: false,
          debt_override: null,
          base_salary: 30000,
          hourly_rate: 153.85,
          absence_cut: 0,
          overtime_pay: 0,
          debt_cut: 0,
          net_payable: 30000,
          paid_amount: 0,
          breakdown: {
            hourlyRate: 153.85,
            monthlyHours: 195,
            baseSalary: 30000,
            isProRated: false,
            absenceCut: 0,
            overtimeHours: 0,
            overtimePay: 0,
            bonus: 0,
            extraCut: 0,
            suggestedDebtCut: 0,
            debtAllocations: [],
            debtCut: 0,
            uncoveredCut: 0,
            lines: [],
          },
          updated_at: new Date().toISOString(),
        },
      ])
    ).rejects.toThrow('Bordro zaten kesinleşmiş');

    expect(useDataStore.getState().db.payrolls.find((p) => p.id === payroll.id)?.status).toBe('taslak');
  });
});

describe('M1: mergeRowsById — uzaktan gelen satırları birleştirme', () => {
  test('Çakışan satır uzaktan güncellenir, yeni uzak satır eklenir', () => {
    const local = [
      { id: 'local-1', name: 'Yerel Satır' },
      { id: 'remote-1', name: 'Eski Değer' },
    ];
    const remote = [
      { id: 'remote-1', name: 'Uzak Güncel Değer' },
      { id: 'remote-2', name: 'Yeni Uzak Satır' },
    ];

    const merged = mergeRowsById(local, remote);
    expect(merged).toHaveLength(3);
    expect(merged.find((r) => r.id === 'local-1')?.name).toBe('Yerel Satır');
    expect(merged.find((r) => r.id === 'remote-1')?.name).toBe('Uzak Güncel Değer');
    expect(merged.find((r) => r.id === 'remote-2')?.name).toBe('Yeni Uzak Satır');
  });
});

describe('M2: validateEkCalismaDate — tekil kaynak iş günü kısıtı', () => {
  test('Normal iş gününde ek çalışma engellenir, tatil/hafta sonu kabul edilir', () => {
    const workdayPlan = {
      date: '2026-11-04',
      kind: 'normal' as const,
      plannedHours: 9,
      isWorkday: true,
      multiplier: null,
      overtimeMultiplier: null,
      title: null,
      event: null,
      startMinutes: 480,
      endMinutes: 1080,
    };
    const checkWorkday = validateEkCalismaDate(workdayPlan);
    expect(checkWorkday.valid).toBe(false);
    expect(checkWorkday.error).toMatch(/zaten iş günü/);

    const holidayPlan = {
      ...workdayPlan,
      isWorkday: false,
      kind: 'resmi_tatil' as const,
    };
    const checkHoliday = validateEkCalismaDate(holidayPlan);
    expect(checkHoliday.valid).toBe(true);
    expect(checkHoliday.error).toBeUndefined();
  });
});
