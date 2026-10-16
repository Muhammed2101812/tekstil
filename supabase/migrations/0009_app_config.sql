-- ==============================================================================
-- 0009 — Uygulama Konfigürasyonu ve Zorunlu Güncelleme (Min Version Gate)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'app_config_select'
  ) THEN
    CREATE POLICY app_config_select ON app_config
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;

INSERT INTO app_config (key, value)
VALUES (
  'app_version',
  '{
    "min_version_code": 5,
    "latest_version_code": 5,
    "title": "Güncelleme Gerekli",
    "message": "Uygulamanın yeni özelliklerini ve güvenlik güncellemelerini kullanabilmek için lütfen Google Play üzerinden son sürüme güncelleyin.",
    "store_url": "https://play.google.com/store/apps/details?id=com.tekstil.takip"
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = timezone('utc'::text, now());
