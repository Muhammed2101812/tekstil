-- ==============================================================================
-- 0011 — Devamlı Olmayan (Günlük / Geçici / Yardımcı) Çalışan Takibi
-- Sabit puantaj ve bordroyu etkilemeyen bağımsız yevmiye ve yardım kayıtları
-- ==============================================================================

CREATE TABLE IF NOT EXISTS temp_work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_name TEXT NOT NULL,
  phone TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_type TEXT NOT NULL DEFAULT 'tam_gun' CHECK (duration_type IN ('tam_gun', 'yarim_gun', 'saatlik')),
  hours NUMERIC(4,2),
  task_description TEXT,
  daily_wage NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at DATE,
  payment_method TEXT CHECK (payment_method IN ('nakit', 'banka')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- updated_at otomatik tetikleyici
CREATE TRIGGER trg_temp_work_logs_updated
  BEFORE UPDATE ON temp_work_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_temp_work_logs_org_date ON temp_work_logs(org_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_temp_work_logs_org_worker ON temp_work_logs(org_id, worker_name);

-- ─── RLS Politikaları ─────────────────────────────────────────────────────────

ALTER TABLE temp_work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY temp_work_logs_select ON temp_work_logs
  FOR SELECT USING (org_id IN (SELECT current_user_org_ids()));

CREATE POLICY temp_work_logs_insert ON temp_work_logs
  FOR INSERT WITH CHECK (org_id IN (SELECT current_user_org_ids()));

CREATE POLICY temp_work_logs_update ON temp_work_logs
  FOR UPDATE USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

CREATE POLICY temp_work_logs_delete ON temp_work_logs
  FOR DELETE USING (is_org_owner(org_id));

-- ─── Audit Log Tetikleyicisi ─────────────────────────────────────────────────

CREATE TRIGGER trg_audit_temp_work_logs
  AFTER INSERT OR UPDATE OR DELETE ON temp_work_logs
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ─── restore_org_backup Güncellemesi (temp_work_logs desteği) ────────────────

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
    'production_batches', 'temp_work_logs'
  ];
  -- çocuk → ebeveyn silme sırası (tersi)
  v_del_tables TEXT[] := ARRAY[
    'temp_work_logs', 'production_batches',
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
  -- sessiz veri kaybı yerine açık hata.
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
  -- yedeğin kendi-org satırlarına işaret etmeli.
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
