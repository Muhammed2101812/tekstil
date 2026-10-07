-- ==============================================================================
-- 0005 — Düzeltmeler: K2 (2029-2030 tatil tohumu) & K4 (deterministic payment_id)
-- ==============================================================================

-- ─── 1. K2: create_organization RPC'si (2026–2030 tatil & arife tohumları) ──────

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

  -- Resmî tatiller: 2026–2030 (istemcideki holidays-tr.ts ile birebir aynı)
  v_year := extract(year from v_now)::int;
  INSERT INTO calendar_events (id, org_id, date, type, title, start_time, end_time, paid, multiplier, scope)
  SELECT gen_random_uuid(), v_org, d::date, t.type, h.title, t.start_time, t.end_time, true, t.multiplier, 'tuma'
  FROM (VALUES
    -- 2026
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
    ('2028-05-07','Kurban Bayramı 3. Gün'), ('2028-05-08','Kurban Bayramı 4. Gün'),
    -- 2029
    ('2029-01-01','Yılbaşı'), ('2029-04-23','Ulusal Egemenlik ve Çocuk Bayramı'),
    ('2029-05-01','Emek ve Dayanışma Günü'), ('2029-05-19','Atatürk’ü Anma, Gençlik ve Spor Bayramı'),
    ('2029-07-15','Demokrasi ve Millî Birlik Günü'), ('2029-08-30','Zafer Bayramı'),
    ('2029-10-29','Cumhuriyet Bayramı'),
    ('2029-02-14','Ramazan Bayramı 1. Gün'), ('2029-02-15','Ramazan Bayramı 2. Gün'), ('2029-02-16','Ramazan Bayramı 3. Gün'),
    ('2029-04-23','Kurban Bayramı 1. Gün'), ('2029-04-24','Kurban Bayramı 2. Gün'),
    ('2029-04-25','Kurban Bayramı 3. Gün'), ('2029-04-26','Kurban Bayramı 4. Gün'),
    -- 2030
    ('2030-01-01','Yılbaşı'), ('2030-04-23','Ulusal Egemenlik ve Çocuk Bayramı'),
    ('2030-05-01','Emek ve Dayanışma Günü'), ('2030-05-19','Atatürk’ü Anma, Gençlik ve Spor Bayramı'),
    ('2030-07-15','Demokrasi ve Millî Birlik Günü'), ('2030-08-30','Zafer Bayramı'),
    ('2030-10-29','Cumhuriyet Bayramı'),
    ('2030-02-03','Ramazan Bayramı 1. Gün'), ('2030-02-04','Ramazan Bayramı 2. Gün'), ('2030-02-05','Ramazan Bayramı 3. Gün'),
    ('2030-04-12','Kurban Bayramı 1. Gün'), ('2030-04-13','Kurban Bayramı 2. Gün'),
    ('2030-04-14','Kurban Bayramı 3. Gün'), ('2030-04-15','Kurban Bayramı 4. Gün')
  ) AS h(d, title)
  CROSS JOIN LATERAL (SELECT 'resmi_tatil'::text AS type, NULL::text AS start_time, NULL::text AS end_time, 2.0::numeric AS multiplier) t
  WHERE extract(year from d::date) BETWEEN v_year AND v_year + 2;

  -- Arifeler (yarım gün 08:00–13:00)
  INSERT INTO calendar_events (id, org_id, date, type, title, start_time, end_time, paid, scope)
  SELECT gen_random_uuid(), v_org, d::date, 'yarim_gun', title, '08:00', '13:00', true, 'tuma'
  FROM (VALUES
    ('2026-03-19','Ramazan Bayramı Arifesi'), ('2026-05-26','Kurban Bayramı Arifesi'), ('2026-10-28','Cumhuriyet Bayramı Arifesi'),
    ('2027-03-09','Ramazan Bayramı Arifesi'), ('2027-05-16','Kurban Bayramı Arifesi'), ('2027-10-28','Cumhuriyet Bayramı Arifesi'),
    ('2028-02-25','Ramazan Bayramı Arifesi'), ('2028-05-04','Kurban Bayramı Arifesi'), ('2028-10-28','Cumhuriyet Bayramı Arifesi'),
    ('2029-02-13','Ramazan Bayramı Arifesi'), ('2029-04-22','Kurban Bayramı Arifesi'), ('2029-10-28','Cumhuriyet Bayramı Arifesi'),
    ('2030-02-02','Ramazan Bayramı Arifesi'), ('2030-04-11','Kurban Bayramı Arifesi'), ('2030-10-28','Cumhuriyet Bayramı Arifesi')
  ) AS h(d, title)
  WHERE extract(year from d::date) BETWEEN v_year AND v_year + 2;

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── 2. K4: finalize_payroll RPC'si (istemci payment_id desteği) ────────────────

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

    -- Taksit tahsilatı: borçlardan düş (istemcideki deterministik UUID ile eşleştirilir)
    IF v_item ? 'debt_allocations' THEN
      FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_item->'debt_allocations') LOOP
        INSERT INTO debt_payments (id, org_id, debt_id, employee_id, amount, paid_at, method, payroll_item_id)
        VALUES (
          coalesce((v_alloc->>'payment_id')::uuid, (v_alloc->>'paymentId')::uuid, gen_random_uuid()),
          v_org, (v_alloc->>'debt_id')::uuid, (v_item->>'employee_id')::uuid,
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
