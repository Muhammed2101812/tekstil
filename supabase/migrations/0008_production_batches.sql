-- ==============================================================================
-- 0008 — Üretim / Parti (Etiket) Takibi
-- Model bazında renkli meto etiketleri ve üretilen adetlerin kaydı
-- ==============================================================================

CREATE TABLE IF NOT EXISTS production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  label_color TEXT NOT NULL CHECK (label_color IN ('kraft', 'blue', 'green', 'red', 'yellow', 'pink', 'orange', 'white')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- updated_at otomatik tetikleyici
CREATE TRIGGER trg_production_batches_updated
  BEFORE UPDATE ON production_batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_production_batches_org_date ON production_batches(org_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_production_batches_org_model ON production_batches(org_id, model_name);

-- ─── RLS Politikaları ─────────────────────────────────────────────────────────

ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY production_batches_select ON production_batches
  FOR SELECT USING (org_id IN (SELECT current_user_org_ids()));

CREATE POLICY production_batches_insert ON production_batches
  FOR INSERT WITH CHECK (org_id IN (SELECT current_user_org_ids()));

CREATE POLICY production_batches_update ON production_batches
  FOR UPDATE USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

CREATE POLICY production_batches_delete ON production_batches
  FOR DELETE USING (org_id IN (SELECT current_user_org_ids()));

-- ─── Audit Log Tetikleyicisi ─────────────────────────────────────────────────

CREATE TRIGGER trg_audit_production_batches
  AFTER INSERT OR UPDATE OR DELETE ON production_batches
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
