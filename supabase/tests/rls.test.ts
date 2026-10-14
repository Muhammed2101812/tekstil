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

  test('Bordro RPC akışı: kesinleştirme ve geri alma', async () => {    // Çalışan + maaş + borç
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

    // Davet kodu akışı kaldırıldı (0006): B firmaya üye alınamaz; yetkisiz
    // işlem reddedilir — bordro geri alma yalnızca firma sahibinde
    const revertAsB = await b.rpc('revert_payroll', { p_payroll_id: payrollId, p_reason: 'deneme' });
    expect(revertAsB.error).toBeTruthy();

    const revertAsA = await a.rpc('revert_payroll', { p_payroll_id: payrollId, p_reason: 'test geri alma' });
    expect(revertAsA.error).toBeNull();

    // Geri alınca borç düşümü de döner
    const { count: dp } = await a.from('debt_payments').select('id', { count: 'exact', head: true }).eq('debt_id', debtId);
    expect(dp).toBe(0);
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

    // 0007: employee_id FK NO ACTION — geçmişi olan çalışan silinemez;
    // önce puantajı temizle (owner DELETE yetkisi 0007 ile kısıtlandı)
    await a.from('attendance').delete().eq('employee_id', empId);
    const delEmp = await a.from('employees').delete().eq('id', empId);
    expect(delEmp.error).toBeNull();
  });

  test('Kullanıcı yönetimi (0006): 1:1 firma kuralı ve owner-only üye silme', async () => {
    // 1:1 — A zaten bir firmaya sahip; ikinci firma kuramaz (UNIQUE user_id)
    const second = await a.rpc('create_organization', { p_name: 'İkinci Atölye' });
    expect(second.error).toBeTruthy();

    // Üye olmayan B, A'nın üyelik satırını silemez (RLS is_org_owner;
    // DELETE policy ihlali hata yerine 0 satır etkiler)
    const { data: aMembers } = await a.from('org_members').select('id').eq('org_id', orgId);
    const memberId = aMembers?.[0]?.id;
    expect(memberId).toBeTruthy();
    await b.from('org_members').delete().eq('id', memberId);

    const { count: after } = await a.from('org_members').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);
    expect(after).toBe(1);
  });

  // ─── 0007: Veri koruma katmanı ─────────────────────────────────────────────

  test('0007: geçmişi olan çalışan silinemez (employee_id FK NO ACTION)', async () => {
    const empId = crypto.randomUUID();
    await a.from('employees').insert({
      id: empId, org_id: orgId, full_name: 'Hasan Geçmişli', start_date: '2026-01-01',
    });
    await a.from('attendance').insert({
      id: crypto.randomUUID(), org_id: orgId, employee_id: empId, day: '2026-11-13', status: 'geldi',
    });

    // Owner olsa bile FK NO ACTION reddeder
    const del = await a.from('employees').delete().eq('id', empId);
    expect(del.error).toBeTruthy();

    // Temizlik: önce çocuk satırlar
    await a.from('attendance').delete().eq('employee_id', empId);
    const del2 = await a.from('employees').delete().eq('id', empId);
    expect(del2.error).toBeNull();
  });

  test('0007: kesinleşmiş bordro doğrudan silinemez (trigger kilidi)', async () => {
    const empId = crypto.randomUUID();
    const payrollId = crypto.randomUUID();
    await a.from('employees').insert({
      id: empId, org_id: orgId, full_name: 'Trigger Test Çalışanı', start_date: '2026-01-01',
    });
    await a.from('payrolls').insert({ id: payrollId, org_id: orgId, year: 2026, month: 10 });

    const items = [{
      id: crypto.randomUUID(), employee_id: empId, employee_name: 'Trigger Test Çalışanı',
      department_name: null, bonus: 0, extra_cut: 0, extra_cut_note: null, skip_debt: false,
      debt_override: null, base_salary: 30000, hourly_rate: 153.85, absence_cut: 0,
      overtime_pay: 0, debt_cut: 0, net_payable: 30000, breakdown: { lines: [] },
    }];
    const fin = await a.rpc('finalize_payroll', { p_payroll_id: payrollId, p_items: items });
    expect(fin.error).toBeNull();

    const del = await a.from('payrolls').delete().eq('id', payrollId);
    expect(del.error?.message).toMatch(/Kesinleşmiş bordro/);

    // Kalemi de doğrudan silmeye çalışmak aynı kilide takılır
    const { data: itemRows } = await a.from('payroll_items').select('id').eq('payroll_id', payrollId);
    const delItem = await a.from('payroll_items').delete().eq('id', itemRows?.[0]?.id);
    expect(delItem.error?.message).toMatch(/Kesinleşmiş bordro/);

    // 0007 3b: UPDATE ile kilidi aşma denemesi de reddedilir
    const upd = await a.from('payrolls').update({ status: 'taslak' }).eq('id', payrollId);
    expect(upd.error?.message).toMatch(/Kesinleşmiş bordro doğrudan değiştirilemez/);

    // Kesinleşmiş kalemin tutarı da UPDATE ile değiştirilemez
    const updItem = await a.from('payroll_items').update({ net_payable: 1 }).eq('id', itemRows?.[0]?.id);
    expect(updItem.error?.message).toMatch(/doğrudan değiştirilemez/);

    // Geri alma RPC'si çalışır (owner + gerekçe), ardından taslak silinebilir
    const revert = await a.rpc('revert_payroll', { p_payroll_id: payrollId, p_reason: 'trigger testi' });
    expect(revert.error).toBeNull();
    const delDraft = await a.from('payrolls').delete().eq('id', payrollId);
    expect(delDraft.error).toBeNull();
    await a.from('employees').delete().eq('id', empId);
  });

  test('0007: restore_org_backup — yetki, org eşleşmesi ve atomik geri yükleme', async () => {
    const { data: orgRow } = await a.from('organizations').select('*').eq('id', orgId).single();
    expect(orgRow).toBeTruthy();

    const empId = crypto.randomUUID();
    const restoredEmp = {
      id: empId, org_id: orgId, full_name: 'Geri Yüklenen Çalışan', start_date: '2026-02-01',
      active: true,
    };

    // Yetkisiz kullanıcı (B, firma sahibi değil) reddedilir
    const asB = await b.rpc('restore_org_backup', {
      p_payload: { db: { organizations: [orgRow], employees: [restoredEmp] } },
    });
    expect(asB.error?.message).toMatch(/firma sahibi/i);

    // Başka firmanın yedeği reddedilir
    const wrongOrg = await a.rpc('restore_org_backup', {
      p_payload: {
        db: {
          organizations: [{ ...orgRow, id: crypto.randomUUID() }],
          employees: [{ ...restoredEmp, org_id: crypto.randomUUID() }],
        },
      },
    });
    expect(wrongOrg.error?.message).toMatch(/bu şirkete ait değil/);

    // Geçerli geri yükleme: eski çalışanlar silinir, yedektekiler yazılır
    const beforeEmps = await a.from('employees').select('id').eq('org_id', orgId);
    expect((beforeEmps.data ?? []).length).toBeGreaterThan(0);

    const ok = await a.rpc('restore_org_backup', {
      p_payload: { version: 1, db: { organizations: [orgRow], employees: [restoredEmp] } },
    });
    expect(ok.error).toBeNull();

    const afterEmps = await a.from('employees').select('id, full_name').eq('org_id', orgId);
    expect(afterEmps.data).toHaveLength(1);
    expect(afterEmps.data?.[0]?.full_name).toBe('Geri Yüklenen Çalışan');
  });
});
