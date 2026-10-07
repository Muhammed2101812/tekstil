/**
 * @jest-environment node
 *
 * RLS ve RPC doğrulama testleri (PLAN.md Bölüm 14.1).
 * Gerçek bir Supabase projesine karşı çalışır; ortam değişkenleri yoksa atlanır:
 *
 *   SUPABASE_TEST_URL=… SUPABASE_TEST_ANON_KEY=… npx jest supabase/tests
 *
 * Test projesinde e-posta onayı kapalı olmalı (Authentication → Providers →
 * Email → Confirm email = OFF). Veriler rastgele e-postalarla yazılır;
 * testin sonunda açtığı firmalar silinir.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_TEST_URL ?? '';
const KEY = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const enabled = Boolean(URL && KEY);

const d = enabled ? describe : describe.skip;

d('RLS — firmalar birbirinin verisini göremez', () => {
  let a: SupabaseClient;
  let b: SupabaseClient;
  let orgId = '';
  const mailA = `test-a-${Date.now()}@example.com`;
  const mailB = `test-b-${Date.now()}@example.com`;
  const PASS = 'Test-1234!x';

  beforeAll(async () => {
    a = createClient(URL, KEY);
    b = createClient(URL, KEY);
    const sa = await a.auth.signUp({ email: mailA, password: PASS });
    const sb = await b.auth.signUp({ email: mailB, password: PASS });
    if (!sa.data.user || !sb.data.user) throw new Error('Kayıt başarısız — e-posta onayı kapalı mı?');
  });

  afterAll(async () => {
    if (orgId) await a.from('organizations').delete().eq('id', orgId);
    await a.auth.signOut();
    await b.auth.signOut();
  });

  test('create_organization: firma + takvim + tatiller + sahip üyeliği', async () => {
    const { data, error } = await a.rpc('create_organization', { p_name: 'Test Atölye A' });
    expect(error).toBeNull();
    orgId = data as string;

    const { count: sched } = await a.from('schedule_days').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    expect(sched).toBe(7);

    const { count: events } = await a.from('calendar_events').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    expect((events ?? 0)).toBeGreaterThan(0);

    const { data: members } = await a.from('org_members').select('role').eq('org_id', orgId);
    expect(members?.[0]?.role).toBe('owner');
  });

  test('B kullanıcısı A firmasının hiçbir tablosunu okuyamaz', async () => {
    const orgs = await b.from('organizations').select('id').eq('id', orgId);
    expect(orgs.data).toHaveLength(0);

    const emps = await b.from('employees').select('id').eq('org_id', orgId);
    expect(emps.data).toHaveLength(0);

    const writes = await b.from('employees').insert({
      id: crypto.randomUUID(), org_id: orgId, full_name: 'Sızma Denemesi', start_date: '2026-01-01',
    });
    expect(writes.error).toBeTruthy();
  });

  test('Davet koduyla katılma ve bordro RPC akışı', async () => {
    // Çalışan + maaş + borç
    const empId = crypto.randomUUID();
    const debtId = crypto.randomUUID();
    const payrollId = crypto.randomUUID();
    const itemId = crypto.randomUUID();

    const e1 = await a.from('employees').insert({
      id: empId, org_id: orgId, full_name: 'Ayşe Yılmaz', start_date: '2026-01-01',
    });
    expect(e1.error).toBeNull();
    await a.from('employee_salaries').insert({
      id: crypto.randomUUID(), org_id: orgId, employee_id: empId, amount: 30000, effective_from: '2026-01-01',
    });
    await a.from('debts').insert({
      id: debtId, org_id: orgId, employee_id: empId, type: 'avans', amount: 6000,
      given_at: '2026-10-15', installments: 3, start_month: '2026-11', client_ref: crypto.randomUUID(),
    });
    await a.from('payrolls').insert({
      id: payrollId, org_id: orgId, year: 2026, month: 11,
    });

    // Kesinleştir: atomik anlık görüntü + taksit düşümü
    const items = [{
      id: itemId, employee_id: empId, employee_name: 'Ayşe Yılmaz', department_name: null,
      bonus: 0, extra_cut: 0, extra_cut_note: null, skip_debt: false, debt_override: null,
      base_salary: 30000, hourly_rate: 153.85, absence_cut: 1384.62, overtime_pay: 0,
      debt_cut: 2000, net_payable: 26615.38,
      breakdown: { lines: [] },
      debt_allocations: [{ debt_id: debtId, amount: 2000 }],
    }];
    const fin = await a.rpc('finalize_payroll', { p_payroll_id: payrollId, p_items: items });
    expect(fin.error).toBeNull();

    const { data: pay } = await a.from('debt_payments').select('amount, method').eq('debt_id', debtId);
    expect(pay?.[0]?.amount).toBe(2000);
    expect(pay?.[0]?.method).toBe('maas_kesinti');

    const { data: pr } = await a.from('payrolls').select('status').eq('id', payrollId).single();
    expect(pr?.status).toBe('kesinlesti');

    // İkinci kez kesinleştirme reddedilir
    const fin2 = await a.rpc('finalize_payroll', { p_payroll_id: payrollId, p_items: items });
    expect(fin2.error).toBeTruthy();

    // Davet: B katılır, yönetici olarak okur; geri alma yalnızca sahipte
    const { data: code } = await a.rpc('create_invite');
    expect(code).toMatch(/^\d{6}$/);
    const join = await b.rpc('join_organization', { p_code: code });
    expect(join.error).toBeNull();

    const revertAsB = await b.rpc('revert_payroll', { p_payroll_id: payrollId, p_reason: 'deneme' });
    expect(revertAsB.error).toBeTruthy();

    const revertAsA = await a.rpc('revert_payroll', { p_payroll_id: payrollId, p_reason: 'test geri alma' });
    expect(revertAsA.error).toBeNull();

    // Geri alınca borç düşümü de döner
    const { count: dp } = await a.from('debt_payments').select('id', { count: 'exact', head: true }).eq('debt_id', debtId);
    expect(dp).toBe(0);

    await b.from('org_members').delete().eq('org_id', orgId).eq('user_id', (await b.auth.getUser()).data.user!.id);
  });

  test('upsert_attendance_bulk: tek işlemde yazar, tekrar gönderim çift kayıt yapmaz', async () => {
    const empId = crypto.randomUUID();
    await a.from('employees').insert({
      id: empId, org_id: orgId, full_name: 'Mehmet Kaya', start_date: '2026-01-01',
    });
    const rows = [{ employee_id: empId, status: 'gelmedi', late_minutes: 0, early_leave_minutes: 0 }];
    const day = '2026-11-12';

    await a.rpc('upsert_attendance_bulk', { p_day: day, p_rows: rows, p_confirm: true });
    await a.rpc('upsert_attendance_bulk', { p_day: day, p_rows: rows, p_confirm: true });

    const { count } = await a.from('attendance').select('id', { count: 'exact', head: true })
      .eq('employee_id', empId).eq('day', day);
    expect(count).toBe(1);

    const { count: confirmed } = await a.from('attendance_days').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).eq('day', day);
    expect(confirmed).toBe(1);

    await a.from('employees').delete().eq('id', empId);
  });
});
