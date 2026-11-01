-- 0010: Faz 0 şema düzeltmeleri (KAPSAMLI_DENETIM_VE_MASTER_PLAN.md)
-- 1) S3: restore_org_backup production_batches'i bilmiyordu — yedekten dönüşte
--    üretim kayıtları sessizce kayboluyordu. Liste güncellendi + kapsam koruması:
--    yedekte bulunan ama restore listelerinde olmayan tablo sessiz düşmek yerine
--    açık hatayla reddedilir.
-- 2) H8: debts.payroll_item_id — bordro kaleminden oluşturulan fark borçlarının
--    kaynak kalemi (dedup anahtarı).
-- 3) U9: attendance_days.confirmed_at NOT NULL bırakılmıştı; gün onayının
--    geri alınabilmesi için nullable yapıldı.

-- ─── 1) restore_org_backup: production_batches + kapsam koruması ─────────────

CREATE OR REPLACE FUNCTION restore_org_backup(p_payload JSONB) RETURNS VOID AS $$
DECLARE
  v_org UUID;
  v_org_row JSONB;
  v_members JSONB;
  v_row JSONB;
  v_payload_table TEXT;
  -- ebeveyn → çocuk yazım sırası (FK'lar)
  v_ins_tables TEXT[] := ARRAY[
    'departments', 'schedule_days', 'calendar_events', 'employees', 'employee_salaries',
    'attendance', 'attendance_days', 'overtime', 'debts', 'payrolls',
    'payroll_items', 'salary_payments', 'debt_payments', 'leave_adjustments',
    'production_batches'
  ];
  -- çocuk → ebeveyn silme sırası (tersi)
  v_del_tables TEXT[] := ARRAY[
    'production_batches',
    'leave_adjustments', 'debt_payments', 'salary_payments', 'payroll_items', 'payrolls',
    'debts', 'overtime', 'attendance_days', 'attendance', 'employee_salaries',
    'employees', 'calendar_events', 'schedule_days', 'departments'
  ];
  t TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Giriş yapılmadı'; END IF;
  IF p_payload IS NULL OR p_payload->'db' IS NULL THEN
    RAISE EXCEPTION 'Geçersiz yedek dosyası (db alanı yok)';
  END IF;

  SELECT org_id INTO v_org FROM org_members
    WHERE user_id = auth.uid() AND role = 'owner'
    ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Geri yükleme yetkisi yalnızca firma sahibinde';
  END IF;

  -- Yedek bu firmaya ait mi? (organizations[0].id eşleşmeli)
  v_org_row := p_payload->'db'->'organizations'->0;
  IF v_org_row IS NULL OR (v_org_row->>'id')::UUID IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Yedek dosyası bu şirkete ait değil';
  END IF;

  -- Kapsam koruması: yedekte bulunan ama bu fonksiyonun bilmediği tablo varsa
  -- sessiz veri kaybı yerine açık hata (yeni tablo eklendiğinde burası güncellenmelidir).
  FOR v_payload_table IN SELECT jsonb_object_keys(p_payload->'db') LOOP
    IF v_payload_table NOT IN ('organizations', 'org_members')
       AND NOT (v_payload_table = ANY (v_ins_tables)) THEN
      RAISE EXCEPTION 'Yedekte bu sürümün geri yükleyemediği tablo var: %', v_payload_table;
    END IF;
  END LOOP;

  -- Tüm satırların org_id'si eşleşmeli (başka firmanın verisi reddedilir)
  FOREACH t IN ARRAY v_ins_tables LOOP
    IF p_payload->'db'->t IS NOT NULL AND jsonb_typeof(p_payload->'db'->t) = 'array' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_payload->'db'->t) r
        WHERE r->>'org_id' IS NULL OR (r->>'org_id')::UUID IS DISTINCT FROM v_org
      ) THEN
        RAISE EXCEPTION 'Yedek içinde başka şirkete ait kayıt var (%)', t;
      END IF;
    END IF;
  END LOOP;

  -- Çapraz referans doğrulaması: departman/takvim referansları yine bu
  -- yedeğin kendi-org satırlarına işaret etmeli (başka firmanın kaydı olamaz).
  IF p_payload->'db'->'employees' IS NOT NULL AND jsonb_typeof(p_payload->'db'->'employees') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payload->'db'->'employees') r
      WHERE r->>'department_id' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            COALESCE(p_payload->'db'->'departments', '[]'::jsonb)) d
          WHERE d->>'id' = r->>'department_id' AND (d->>'org_id')::UUID = v_org
        )
    ) THEN
      RAISE EXCEPTION 'Yedek içinde geçersiz departman referansı var (employees)';
    END IF;
  END IF;
  IF p_payload->'db'->'overtime' IS NOT NULL AND jsonb_typeof(p_payload->'db'->'overtime') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payload->'db'->'overtime') r
      WHERE r->>'calendar_event_id' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            COALESCE(p_payload->'db'->'calendar_events', '[]'::jsonb)) e
          WHERE e->>'id' = r->>'calendar_event_id' AND (e->>'org_id')::UUID = v_org
        )
    ) THEN
      RAISE EXCEPTION 'Yedek içinde geçersiz takvim referansı var (overtime)';
    END IF;
  END IF;

  -- Bordro silme kilidi muafiyeti (transaction-local, tek birleşik bayrak)
  PERFORM set_config('app.bypass_payroll_lock', 'on', true);

  -- 1) Mevcut iş verisini koşulsuz temizle (çocuk → ebeveyn).
  --    Kısmi yedekte bile eski satır kalmasın ve FK ihlali oluşmasın.
  FOREACH t IN ARRAY v_del_tables LOOP
    EXECUTE format('DELETE FROM %I WHERE org_id = $1', t) USING v_org;
  END LOOP;

  -- 2) Firma satırını yedekteki değerlerle güncelle
  UPDATE organizations SET
    name = COALESCE(v_org_row->>'name', name),
    logo_url = COALESCE(v_org_row->>'logo_url', logo_url),
    settings = COALESCE(v_org_row->'settings', settings),
    updated_at = timezone('utc'::text, now())
  WHERE id = v_org;

  -- 3) Yedek verisini yaz (ebeveyn → çocuk); eksik zorunlu kolonlar
  --    şema varsayılanıyla tamamlanır (fill_defaults).
  FOREACH t IN ARRAY v_ins_tables LOOP
    IF p_payload->'db'->t IS NOT NULL AND jsonb_typeof(p_payload->'db'->t) = 'array'
       AND jsonb_array_length(p_payload->'db'->t) > 0 THEN
      EXECUTE format(
        'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I, $1)',
        t, t)
      USING fill_defaults(t, p_payload->'db'->t);
    END IF;
  END LOOP;

  -- 4) Üyelikler: yalnız upsert (hiçbir üyelik silinmez — lockout riski);
  --    auth.users'ta artık olmayan kullanıcıların satırları atlanır.
  v_members := p_payload->'db'->'org_members';
  IF v_members IS NOT NULL AND jsonb_typeof(v_members) = 'array' THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_members) LOOP
      IF (v_row->>'org_id')::UUID = v_org
         AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = (v_row->>'user_id')::UUID) THEN
        INSERT INTO org_members (id, org_id, user_id, role, name, email, created_at)
        VALUES (
          (v_row->>'id')::UUID, v_org, (v_row->>'user_id')::UUID,
          COALESCE(v_row->>'role', 'admin'), v_row->>'name', v_row->>'email',
          COALESCE((v_row->>'created_at')::timestamptz, timezone('utc'::text, now()))
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── 2) H8: bordro kaleminden türeyen borçların kaynak kalemi ────────────────

ALTER TABLE debts ADD COLUMN IF NOT EXISTS payroll_item_id UUID REFERENCES payroll_items(id);

CREATE INDEX IF NOT EXISTS idx_debts_payroll_item
  ON debts(payroll_item_id)
  WHERE payroll_item_id IS NOT NULL;

-- ─── 3) U9: gün onayı geri alınabilsin ───────────────────────────────────────

ALTER TABLE attendance_days ALTER COLUMN confirmed_at DROP NOT NULL;
