-- ==============================================================================
-- 0012 — İşsiz Günü durumu
-- Atölyede iş olmadığı gün: tüm kadro için işaretlenir, gün ücretsizdir.
-- Kişisel 'ucretsiz_izin'den ayrı bir durumdur (bordroda ayrı kalem).
-- 0001'deki attendance.status CHECK kısıtına yeni değer eklenir.
-- ==============================================================================

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;

ALTER TABLE attendance ADD CONSTRAINT attendance_status_check CHECK (status IN (
  'geldi', 'gelmedi', 'gec_geldi', 'erken_cikti', 'yarim_gun',
  'yillik_izin', 'mazeret_izni', 'ucretsiz_izin', 'issiz_gunu', 'rapor'
));
