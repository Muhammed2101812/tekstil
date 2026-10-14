-- ==============================================================================
-- 0007 — Veri koruma katmanı (docs/VERI_GUVENLIGI_PLANI.md, Faz 1 ve 3)
--   1. RLS DELETE kısıtlaması: iş tablolarında satır silme yalnız firma sahibi
--   2. employee_id FK'ları CASCADE → NO ACTION (zincirleme silme koruması)
--   3. Kesinleşmiş bordro silme kilidi (BEFORE DELETE trigger)
--   4. restore_org_backup RPC: sunucu tarafı atomik yedek geri yükleme
-- ==============================================================================

-- ─── 1. RLS: FOR ALL → SELECT/INSERT/UPDATE (üye) + DELETE (yalnız owner) ────

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employees', 'employee_salaries', 'attendance', 'attendance_days', 'overtime',
    'debts', 'debt_payments', 'payrolls', 'payroll_items', 'salary_payments'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (org_id IN (SELECT current_user_org_ids()));',
      t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (org_id IN (SELECT current_user_org_ids()));',
      t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (org_id IN (SELECT current_user_org_ids())) WITH CHECK (org_id IN (SELECT current_user_org_ids()));',
      t || '_update', t);
    -- Satır silme yalnızca Firma Sahibi'nde (agent.md: DELETE politikası kuralı)
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (is_org_owner(org_id));',
      t || '_delete', t);
  END LOOP;
END $$;

-- ─── 2. employee_id FK'ları: ON DELETE NO ACTION ─────────────────────────────
-- Tekil personel silmede geçmiş kaydı varsa PostgreSQL kesin reddeder.
-- organizations silinirken (delete-account) org_id CASCADE zinciri aynı ifade
-- içinde tüm alt satırları temizlediği için NO ACTION kontrolü statement sonunda
-- sorunsuz geçer.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance', 'employee_salaries', 'overtime', 'debts', 'debt_payments',
    'leave_adjustments', 'payroll_items', 'salary_payments'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I;', t, t || '_employee_id_fkey');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE NO ACTION;',
      t, t || '_employee_id_fkey');
  END LOOP;
END $$;

-- ─── 3. Kesinleşmiş bordro silme kilidi ──────────────────────────────────────
-- Muafiyetler:
--   a) organizations satırı artık yok → org cascade silme (delete-account) akışı
--   b) app.restore_mode = '1' → restore_org_backup akışı (aşağıda)

CREATE OR REPLACE FUNCTION protect_finalized_payroll() RETURNS trigger AS $$
BEGIN
  -- Yönetim akışları için tek birleşik bypass: revert_payroll ve
  -- restore_org_backup işlem başında set_config ile açar (transaction-local).
  IF current_setting('app.bypass_payroll_lock', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.status <> 'taslak' THEN
    -- organizations satırı çoktan silinmişse bu bir org cascade silmesidir
    -- (delete-account): RI tetikleyicileri ifade sonunda çalıştığı için
    -- parent satırı bu noktada yoktur.
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = OLD.org_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Kesinleşmiş bordro doğrudan silinemez, önce taslağa geri alınmalıdır.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_payrolls_protect_delete ON payrolls;
CREATE TRIGGER trg_payrolls_protect_delete BEFORE DELETE ON payrolls
  FOR EACH ROW EXECUTE FUNCTION protect_finalized_payroll();

-- Üst bordrosu kesinleşmiş kalemler de doğrudan silinemez. Üst bordro satırı
-- zaten silinmişse (taslak bordro/org cascade) v_status NULL olur ve silmeye izin verilir.
CREATE OR REPLACE FUNCTION protect_finalized_payroll_item() RETURNS trigger AS $$
DECLARE
  v_status TEXT;
  v_org UUID;
BEGIN
  IF current_setting('app.bypass_payroll_lock', true) = 'on' THEN
    RETURN OLD;
  END IF;
  SELECT status, org_id INTO v_status, v_org FROM payrolls WHERE id = OLD.payroll_id;
  IF v_status IS NOT NULL AND v_status <> 'taslak' THEN
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Kesinleşmiş bordroya bağlı kalem doğrudan silinemez, önce taslağa geri alınmalıdır.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_payroll_items_protect_delete ON payroll_items;
CREATE TRIGGER trg_payroll_items_protect_delete BEFORE DELETE ON payroll_items
  FOR EACH ROW EXECUTE FUNCTION protect_finalized_payroll_item();

-- ─── 3b. Kesinleşmiş bordro UPDATE kilidi ────────────────────────────────────
-- DELETE kilidi tek başına yeterli değil: üye doğrudan
-- UPDATE payrolls SET status='taslak' yapıp kilidi aşamaz — izin verilen tek
-- geçişler: taslaktan çıkışlar (finalize RPC), kesinlesti→odendi (ödeme akışı)
-- ve sunucu tarafı birleşik yönetim bayrağı (app.bypass_payroll_lock =
-- revert_payroll ve restore_org_backup tarafından 'on' yapılarak açılır).

CREATE OR REPLACE FUNCTION protect_finalized_payroll_update() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.bypass_payroll_lock', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'taslak' THEN
    IF OLD.status = 'kesinlesti' AND NEW.status = 'odendi' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Kesinleşmiş bordro doğrudan değiştirilemez; taslağa döndürmek için bordroyu geri alın.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_payrolls_protect_update ON payrolls;
CREATE TRIGGER trg_payrolls_protect_update BEFORE UPDATE ON payrolls
  FOR EACH ROW EXECUTE FUNCTION protect_finalized_payroll_update();

-- Kesinleşmiş bordro kaleminde yalnız ödeme ilerlemesi (paid_amount) değişebilir;
-- tutar/puantaj anlık görüntüsü değişmez (finalize sözleşmesi).
CREATE OR REPLACE FUNCTION protect_finalized_payroll_item_update() RETURNS trigger AS $$
DECLARE
  v_status TEXT;
  v_org UUID;
  v_old JSONB;
  v_new JSONB;
BEGIN
  IF current_setting('app.bypass_payroll_lock', true) = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT status, org_id INTO v_status, v_org FROM payrolls WHERE id = OLD.payroll_id;
  IF v_status IS NOT NULL AND v_status <> 'taslak' THEN
    v_old := to_jsonb(OLD) - 'paid_amount' - 'updated_at';
    v_new := to_jsonb(NEW) - 'paid_amount' - 'updated_at';
    IF v_new = v_old AND NEW.paid_amount >= OLD.paid_amount THEN
      RETURN NEW; -- yalnız ödeme ilerlemesi
    END IF;
    RAISE EXCEPTION 'Kesinleşmiş bordroya bağlı kalem doğrudan değiştirilemez; önce taslağa geri alınmalıdır.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_payroll_items_protect_update ON payroll_items;
CREATE TRIGGER trg_payroll_items_protect_update BEFORE UPDATE ON payroll_items
  FOR EACH ROW EXECUTE FUNCTION protect_finalized_payroll_item_update();

-- revert_payroll yeniden tanımı: yönetim bayrağı set ederek UPDATE kilidini
-- yasal yoldan geçer (0003'teki gövde ile aynı, yalnızca bayrak satırı eklendi).
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

  PERFORM set_config('app.bypass_payroll_lock', 'on', true);

  DELETE FROM salary_payments WHERE payroll_item_id IN (SELECT id FROM payroll_items WHERE payroll_id = p_payroll_id);
  DELETE FROM debt_payments WHERE payroll_item_id IN (SELECT id FROM payroll_items WHERE payroll_id = p_payroll_id);
  UPDATE payroll_items SET paid_amount = 0, updated_at = timezone('utc'::text, now())
    WHERE payroll_id = p_payroll_id;
  UPDATE payrolls SET status = 'taslak', revert_reason = p_reason WHERE id = p_payroll_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── 4a. Yedek satırlarında eksik NOT NULL DEFAULT kolonlarını doldur ────────
-- jsonb_populate_recordset eksik anahtara DEFAULT değil NULL basar; geri
-- yüklenen satırlarda eksik zorunlu kolonları şema varsayılanıyla tamamlar.

CREATE OR REPLACE FUNCTION fill_defaults(p_table TEXT, p_rows JSONB) RETURNS JSONB AS $$
DECLARE
  c RECORD;
  v_row JSONB;
  v_filled JSONB;
  v_default JSONB;
  v_out JSONB := '[]'::jsonb;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_filled := v_row;
    FOR c IN
      SELECT column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table
        AND is_nullable = 'NO'
        AND column_default IS NOT NULL
    LOOP
      IF NOT (v_filled ? c.column_name) OR v_filled->c.column_name = 'null'::jsonb THEN
        EXECUTE format('SELECT to_jsonb(%s)', c.column_default) INTO v_default;
        v_filled := jsonb_set(v_filled, ARRAY[c.column_name], v_default);
      END IF;
    END LOOP;
    v_out := v_out || v_filled;
  END LOOP;
  RETURN v_out;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ─── 4. restore_org_backup: atomik sunucu tarafı yedek geri yükleme ──────────
-- p_payload: { version, exportedAt, db: { <tablo>: [satırlar...] } }
-- Kurallar:
--   * Yalnız firma sahibi çağırabilir (is_org_owner).
--   * Başka firmanın yedeği reddedilir (tüm org_id'ler + organizations.id doğrulanır).
--   * Tek transaction: eski veriler çocuk→ebeveyn silinir, yenileri ebeveyn→çocuk yazılır.
--   * org_members yalnız upsert edilir (kullanıcıyı kilitleme riski); auth kullanıcısı
--     silinmiş üyelik satırları atlanır.

CREATE OR REPLACE FUNCTION restore_org_backup(p_payload JSONB) RETURNS VOID AS $$
DECLARE
  v_org UUID;
  v_org_row JSONB;
  v_members JSONB;
  v_row JSONB;
  -- ebeveyn → çocuk yazım sırası (FK'lar)
  v_ins_tables TEXT[] := ARRAY[
    'departments', 'schedule_days', 'calendar_events', 'employees', 'employee_salaries',
    'attendance', 'attendance_days', 'overtime', 'debts', 'payrolls',
    'payroll_items', 'salary_payments', 'debt_payments', 'leave_adjustments'
  ];
  -- çocuk → ebeveyn silme sırası (tersi)
  v_del_tables TEXT[] := ARRAY[
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
