-- ==============================================================================
-- 0003 — RPC fonksiyonları (PLAN.md Bölüm 5 "Veritabanı fonksiyonları")
-- create_organization, create_invite, join_organization,
-- upsert_attendance_bulk, finalize_payroll, revert_payroll
-- ==============================================================================

-- ─── Firma kurma: firma + sahip üyeliği + varsayılan takvim + tatiller ────────

CREATE OR REPLACE FUNCTION create_organization(
  p_name TEXT,
  p_logo_url TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_org UUID := gen_random_uuid();
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_year INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Giriş yapılmadı'; END IF;

  INSERT INTO organizations (id, name, logo_url, settings)
  VALUES (v_org, p_name, p_logo_url, '{}'::jsonb);

  INSERT INTO org_members (id, org_id, user_id, role)
  VALUES (gen_random_uuid(), v_org, auth.uid(), 'owner');

  -- Varsayılan haftalık takvim: Pzt–Cum 08:00–18:00 (öğle 1 sa ücretsiz)
  INSERT INTO schedule_days (id, org_id, weekday, is_workday, start_time, end_time, breaks)
  VALUES
    (gen_random_uuid(), v_org, 1, true, '08:00', '18:00', '[{"name":"Öğle","start":"12:30","end":"13:30","paid":false}]'::jsonb),
    (gen_random_uuid(), v_org, 2, true, '08:00', '18:00', '[{"name":"Öğle","start":"12:30","end":"13:30","paid":false}]'::jsonb),
    (gen_random_uuid(), v_org, 3, true, '08:00', '18:00', '[{"name":"Öğle","start":"12:30","end":"13:30","paid":false}]'::jsonb),
    (gen_random_uuid(), v_org, 4, true, '08:00', '18:00', '[{"name":"Öğle","start":"12:30","end":"13:30","paid":false}]'::jsonb),
    (gen_random_uuid(), v_org, 5, true, '08:00', '18:00', '[{"name":"Öğle","start":"12:30","end":"13:30","paid":false}]'::jsonb),
    (gen_random_uuid(), v_org, 6, false, '08:00', '13:00', '[]'::jsonb),
    (gen_random_uuid(), v_org, 7, false, '08:00', '18:00', '[]'::jsonb);

  -- Resmî tatiller: kurulum yılı ile +2 yıl arası (uygulama içindeki gömülü
  -- tabloyla aynı veri; istemci de kapatabilir/düzenleyebilir)
  v_year := extract(year from v_now)::int;
  INSERT INTO calendar_events (id, org_id, date, type, title, start_time, end_time, paid, multiplier, scope)
  SELECT gen_random_uuid(), v_org, d::date, t.type, h.title, t.start_time, t.end_time, true, t.multiplier, 'tuma'
  FROM (VALUES
    -- 2026 (dini bayramlar dahil)
    ('2026-01-01','Yılbaşı'), ('2026-04-23','Ulusal Egemenlik ve Çocuk Bayramı'),
    ('2026-05-01','Emek ve Dayanışma Günü'), ('2026-05-19','Atatürk’ü Anma, Gençlik ve Spor Bayramı'),
    ('2026-07-15','Demokrasi ve Millî Birlik Günü'), ('2026-08-30','Zafer Bayramı'),
    ('2026-10-29','Cumhuriyet Bayramı'),
    ('2026-03-20','Ramazan Bayramı 1. Gün'), ('2026-03-21','Ramazan Bayramı 2. Gün'), ('2026-03-22','Ramazan Bayramı 3. Gün'),
    ('2026-05-27','Kurban Bayramı 1. Gün'), ('2026-05-28','Kurban Bayramı 2. Gün'),
    ('2026-05-29','Kurban Bayramı 3. Gün'), ('2026-05-30','Kurban Bayramı 4. Gün'),
    -- 2027
    ('2027-01-01','Yılbaşı'), ('2027-04-23','Ulusal Egemenlik ve Çocuk Bayramı'),
    ('2027-05-01','Emek ve Dayanışma Günü'), ('2027-05-19','Atatürk’ü Anma, Gençlik ve Spor Bayramı'),
    ('2027-07-15','Demokrasi ve Millî Birlik Günü'), ('2027-08-30','Zafer Bayramı'),
    ('2027-10-29','Cumhuriyet Bayramı'),
    ('2027-03-10','Ramazan Bayramı 1. Gün'), ('2027-03-11','Ramazan Bayramı 2. Gün'), ('2027-03-12','Ramazan Bayramı 3. Gün'),
    ('2027-05-17','Kurban Bayramı 1. Gün'), ('2027-05-18','Kurban Bayramı 2. Gün'),
    ('2027-05-19','Kurban Bayramı 3. Gün'), ('2027-05-20','Kurban Bayramı 4. Gün'),
    -- 2028
    ('2028-01-01','Yılbaşı'), ('2028-04-23','Ulusal Egemenlik ve Çocuk Bayramı'),
    ('2028-05-01','Emek ve Dayanışma Günü'), ('2028-05-19','Atatürk’ü Anma, Gençlik ve Spor Bayramı'),
    ('2028-07-15','Demokrasi ve Millî Birlik Günü'), ('2028-08-30','Zafer Bayramı'),
    ('2028-10-29','Cumhuriyet Bayramı'),
    ('2028-02-26','Ramazan Bayramı 1. Gün'), ('2028-02-27','Ramazan Bayramı 2. Gün'), ('2028-02-28','Ramazan Bayramı 3. Gün'),
    ('2028-05-05','Kurban Bayramı 1. Gün'), ('2028-05-06','Kurban Bayramı 2. Gün'),
    ('2028-05-07','Kurban Bayramı 3. Gün'), ('2028-05-08','Kurban Bayramı 4. Gün')
  ) AS h(d, title)
  CROSS JOIN LATERAL (SELECT 'resmi_tatil'::text AS type, NULL::text AS start_time, NULL::text AS end_time, 2.0::numeric AS multiplier) t
  WHERE extract(year from d::date) BETWEEN v_year AND v_year + 2;

  -- Arifeler (yarım gün 08:00–13:00)
  INSERT INTO calendar_events (id, org_id, date, type, title, start_time, end_time, paid, scope)
  SELECT gen_random_uuid(), v_org, d::date, 'yarim_gun', title, '08:00', '13:00', true, 'tuma'
  FROM (VALUES
    ('2026-03-19','Ramazan Bayramı Arifesi'), ('2026-05-26','Kurban Bayramı Arifesi'), ('2026-10-28','Cumhuriyet Bayramı Arifesi'),
    ('2027-03-09','Ramazan Bayramı Arifesi'), ('2027-05-16','Kurban Bayramı Arifesi'), ('2027-10-28','Cumhuriyet Bayramı Arifesi'),
    ('2028-02-25','Ramazan Bayramı Arifesi'), ('2028-05-04','Kurban Bayramı Arifesi'), ('2028-10-28','Cumhuriyet Bayramı Arifesi')
  ) AS h(d, title)
  WHERE extract(year from d::date) BETWEEN v_year AND v_year + 2;

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Davet kodu ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_invite(p_role TEXT DEFAULT 'admin') RETURNS TEXT AS $$
DECLARE
  v_org UUID;
  v_code TEXT;
BEGIN
  SELECT org_id INTO v_org FROM org_members
  WHERE user_id = auth.uid() ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Firmanız yok'; END IF;

  LOOP
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM org_invites WHERE code = v_code AND used_by IS NULL);
  END LOOP;

  INSERT INTO org_invites (id, org_id, code, role, expires_at, created_by)
  VALUES (gen_random_uuid(), v_org, v_code, p_role, timezone('utc'::text, now()) + interval '7 days', auth.uid());

  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Davet koduyla katılma ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION join_organization(p_code TEXT) RETURNS UUID AS $$
DECLARE
  v_org UUID;
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Giriş yapılmadı'; END IF;

  SELECT i.org_id, i.role INTO v_org, v_role
  FROM org_invites i
  WHERE i.code = p_code AND i.used_by IS NULL AND i.expires_at > now()
  ORDER BY i.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_org IS NULL THEN RAISE EXCEPTION 'Davet kodu geçersiz veya süresi geçmiş'; END IF;

  INSERT INTO org_members (id, org_id, user_id, role)
  VALUES (gen_random_uuid(), v_org, auth.uid(), v_role)
  ON CONFLICT (user_id, org_id) DO NOTHING;

  UPDATE org_invites SET used_by = auth.uid() WHERE code = p_code AND used_by IS NULL;

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Toplu yoklama (tek işlem) ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_attendance_bulk(
  p_day DATE,
  p_rows JSONB,
  p_confirm BOOLEAN DEFAULT true
) RETURNS VOID AS $$
DECLARE
  r JSONB;
  v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM org_members
  WHERE user_id = auth.uid() ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Firmanız yok'; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO attendance (
      id, org_id, employee_id, day, status,
      arrival_time, leave_time, late_minutes, early_leave_minutes, note
    ) VALUES (
      coalesce((r->>'id')::uuid, gen_random_uuid()), v_org, (r->>'employee_id')::uuid, p_day, r->>'status',
      nullif(r->>'arrival_time',''), nullif(r->>'leave_time',''),
      coalesce((r->>'late_minutes')::int, 0), coalesce((r->>'early_leave_minutes')::int, 0),
      nullif(r->>'note','')
    )
    ON CONFLICT (employee_id, day) DO UPDATE SET
      status = EXCLUDED.status,
      arrival_time = EXCLUDED.arrival_time,
      leave_time = EXCLUDED.leave_time,
      late_minutes = EXCLUDED.late_minutes,
      early_leave_minutes = EXCLUDED.early_leave_minutes,
      note = EXCLUDED.note;
  END LOOP;

  IF p_confirm THEN
    INSERT INTO attendance_days (id, org_id, day, confirmed_by)
    VALUES (gen_random_uuid(), v_org, p_day, auth.uid())
    ON CONFLICT (org_id, day) DO UPDATE SET
      confirmed_by = EXCLUDED.confirmed_by,
      confirmed_at = timezone('utc'::text, now());
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Bordro kesinleştirme (atomik) ───────────────────────────────────────────
-- p_items: [{id, employee_id, employee_name, department_name, bonus, extra_cut,
--   extra_cut_note, skip_debt, debt_override, base_salary, hourly_rate,
--   absence_cut, overtime_pay, debt_cut, net_payable, breakdown,
--   debt_allocations: [{debt_id, amount}]}]

CREATE OR REPLACE FUNCTION finalize_payroll(
  p_payroll_id UUID,
  p_items JSONB
) RETURNS VOID AS $$
DECLARE
  v_org UUID;
  v_year INT;
  v_month INT;
  v_item JSONB;
  v_alloc JSONB;
  v_item_id UUID;
  v_paid_at DATE;
BEGIN
  SELECT org_id, year, month INTO v_org, v_year, v_month
  FROM payrolls WHERE id = p_payroll_id FOR UPDATE;

  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = v_org AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Bordro bulunamadı veya yetkiniz yok';
  END IF;
  IF EXISTS (SELECT 1 FROM payrolls WHERE id = p_payroll_id AND status <> 'taslak') THEN
    RAISE EXCEPTION 'Bordro zaten kesinleşmiş';
  END IF;

  v_paid_at := (make_date(v_year, v_month, 1) + interval '1 month - 1 day')::date;

  -- Önceki taslak anlık görüntüsünü ve varsa esnek kayıtları temizle
  DELETE FROM salary_payments WHERE payroll_item_id IN (SELECT id FROM payroll_items WHERE payroll_id = p_payroll_id);
  DELETE FROM debt_payments WHERE payroll_item_id IN (SELECT id FROM payroll_items WHERE payroll_id = p_payroll_id);
  DELETE FROM payroll_items WHERE payroll_id = p_payroll_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_item->>'id')::uuid;
    INSERT INTO payroll_items (
      id, org_id, payroll_id, employee_id, employee_name, department_name,
      bonus, extra_cut, extra_cut_note, skip_debt, debt_override,
      base_salary, hourly_rate, absence_cut, overtime_pay, debt_cut,
      net_payable, paid_amount, breakdown
    ) VALUES (
      v_item_id, v_org, p_payroll_id, (v_item->>'employee_id')::uuid,
      v_item->>'employee_name', nullif(v_item->>'department_name',''),
      coalesce((v_item->>'bonus')::numeric, 0), coalesce((v_item->>'extra_cut')::numeric, 0),
      nullif(v_item->>'extra_cut_note',''), coalesce((v_item->>'skip_debt')::boolean, false),
      NULLIF(v_item->>'debt_override','')::numeric,
      coalesce((v_item->>'base_salary')::numeric, 0),
      coalesce((v_item->>'hourly_rate')::numeric, 0),
      coalesce((v_item->>'absence_cut')::numeric, 0),
      coalesce((v_item->>'overtime_pay')::numeric, 0),
      coalesce((v_item->>'debt_cut')::numeric, 0),
      coalesce((v_item->>'net_payable')::numeric, 0),
      0,
      coalesce(v_item->'breakdown', '{}'::jsonb)
    );

    -- Taksit tahsilatı: borçlardan düş (atomiklik burada)
    IF v_item ? 'debt_allocations' THEN
      FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_item->'debt_allocations') LOOP
        INSERT INTO debt_payments (id, org_id, debt_id, employee_id, amount, paid_at, method, payroll_item_id)
        VALUES (
          gen_random_uuid(), v_org, (v_alloc->>'debt_id')::uuid, (v_item->>'employee_id')::uuid,
          (v_alloc->>'amount')::numeric, v_paid_at, 'maas_kesinti', v_item_id
        );
      END LOOP;
    END IF;
  END LOOP;

  UPDATE payrolls
  SET status = 'kesinlesti',
      finalized_at = timezone('utc'::text, now()),
      finalized_by = auth.uid()
  WHERE id = p_payroll_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Bordro geri alma (yalnızca firma sahibi, gerekçeli) ─────────────────────

CREATE OR REPLACE FUNCTION revert_payroll(
  p_payroll_id UUID,
  p_reason TEXT
) RETURNS VOID AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM payrolls WHERE id = p_payroll_id FOR UPDATE;

  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM org_members WHERE org_id = v_org AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Geri alma yetkisi yalnızca firma sahibinde';
  END IF;

  DELETE FROM salary_payments WHERE payroll_item_id IN (SELECT id FROM payroll_items WHERE payroll_id = p_payroll_id);
  DELETE FROM debt_payments WHERE payroll_item_id IN (SELECT id FROM payroll_items WHERE payroll_id = p_payroll_id);
  UPDATE payroll_items SET paid_amount = 0, updated_at = timezone('utc'::text, now())
    WHERE payroll_id = p_payroll_id;
  UPDATE payrolls SET status = 'taslak', revert_reason = p_reason WHERE id = p_payroll_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
