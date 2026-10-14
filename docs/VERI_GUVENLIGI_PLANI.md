# Veri Güvenliği Uygulama Planı — 14 Ekim 2026

Bu plan, 14 Ekim 2026 tarihli inceleme raporu (`docs/veri-guvenligi-raporu-2026-10-14.md`) sonrası alınan mimari kararların eksiksiz uygulama planıdır. Kararlar beş fazdan oluşur ve kalıcı kurallar `agent.md` dosyasına yazılmıştır.

---

## Faz 1 — Veritabanı Koruma Katmanı (`supabase/migrations/0007_data_protection.sql`)

### 1.1 RLS DELETE kısıtlaması
- Kritik iş tablolarında `FOR ALL` politikası parçalanır: `SELECT`/`INSERT`/`UPDATE` tüm üyelere (`current_user_org_ids()`), **`DELETE` yalnızca `is_org_owner(org_id)`** (Firma Sahibi).
- Kapsam: `employees`, `attendance`, `attendance_days`, `overtime`, `debts`, `debt_payments`, `payrolls`, `payroll_items`, `salary_payments`, `employee_salaries`.
- `organizations` ve `org_members` INSERT/DELETE Politikaları zaten kapalı (0002/0006); dokunulmaz.

### 1.2 `ON DELETE NO ACTION` zincirleme silme koruması
- `employee_id` FK kısıtları CASCADE → **NO ACTION**: `attendance`, `employee_salaries`, `debts`, `debt_payments`, `overtime`, `payroll_items`, `salary_payments`, `leave_adjustments`.
- Neden `NO ACTION` (RESTRICT değil): kısıt kontrolü ifade (statement) sonunda yapılır. `delete-account` Edge Function'ı `organizations` satırını sildiğinde org_id CASCADE zinciri aynı ifade içinde tüm alt satırları temizlediği için kontrol geçer. Tekil personel silmede ise geçmiş kaydı varsa PostgreSQL kesin reddeder.
- `deactivateEmployee` (aktif/pasif) personel için tek çıkar yol; **yeni `deleted_at` kolonu eklenmez**.
- `payroll_items.payroll_id` ve `salary_payments.payroll_item_id` CASCADE kalır (taslak bordro temizliği için).

### 1.3 Kesinleşmiş bordro silme kilidi (trigger)
- `payrolls` üzerinde `BEFORE DELETE` trigger: `status <> 'taslak'` → `RAISE EXCEPTION 'Kesinleşmiş bordro doğrudan silinemez, önce taslağa geri alınmalıdır.'`
- `payroll_items` üzerinde `BEFORE DELETE` trigger: üst bordro `status <> 'taslak'` → aynı red.
- **Review ile eklenen sağlamlaştırma (3b):** `BEFORE UPDATE` trigger'ları — kesinleşmiş bordro `UPDATE ... SET status='taslak'` ile kilidi aşamaz (izin verilen tek geçişler: `kesinlesti → odendi` ödeme akışı ve `app.bypass_payroll_lock='on'` birleşik sunucu bayrağı); kesinleşmiş kalemlerde yalnız `paid_amount` değişebilir. `revert_payroll` RPC'si bayrağı açarak yasal yoldan geçer (0007 içinde yeniden tanımlandı).
- İki muafiyet (bilinçli):
  1. Organizasyon satırı artık yoksa (`delete-account` cascade akışı) silmeye izin verilir.
  2. İşlem-içi `app.restore_mode = '1'` bayrağı set edilmişse (Faz 3 geri yükleme RPC'si) izin verilir.
- Geri alma yalnız `revert_payroll` RPC'si (owner + gerekçe) ile mümkündür.
- Kalan bilinen sınır (kabul edildi): custom GUC bayrakları doğrudan SQL erişimi olan biri tarafından `SET` edilebilir; PostgREST üzerinden SET yolu yoktur, risk yalnız SQL editor/service erişimi olan içeride kişidedir.

## Faz 2 — Tamamen Online Mimariye Geçiş

### 2.1 Cihaz modunun kaldırılması
- `auth.tsx`: `LocalAccount`, `tekstil:local-accounts`, `tekstil:local-session`, `hashPassword` ve tüm yerel-hesap dalları kaldırılır. `signUp`/`signIn`/`resetPassword`/`createManagedUser`/`resetManagedUserPassword` yalnız Supabase/Edge Function yolu.
- UI'daki "cihaz modu" uyarı metinleri kaldırılır; `isSupabaseConfigured` yalnızca kök layout'ta yapılandırma hatası ekranı için kullanılır.
- `createOrganization`'ın yerel dalı kaldırılır; yalnız `create_organization` RPC + sunucudan aynalama.

### 2.2 Offline kuyruk ve yerel JSON kalıcılığının kaldırılması
- Silinen katmanlar: `src/data/queue.ts` (senkron kuyruğu), `src/data/persist.ts` (`tekstil-db.json`), `src/data/snapshot.ts` (cihaz içi otomatik JSON yedekleri) ve `__tests__/data/snapshot.test.ts`.
- `store.ts`: Zustand store **yalnız bellek içi önbellek** olur — `persist`/`saveDB`/kuyruk bağlantıları yok; `upsert`/`remove`/`replaceDB` sadece belleği günceller.
- `flushQueue` ve senkron kuyruğu durumları kaldırılır; `firstSyncDone`/`initialSyncError`/`triggerSync` bayrakları kalır (ilk giriş kapısı UI'da kullanılıyor).

### 2.3 Remote-first yazma kuralı (önce Supabase, sonra store)
- Yeni merkezi yardımcılar (`src/data/supabase.ts`): `remoteUpsert(table, rows)` ve `remoteDelete(table, ids)` — **önce `await` ile Supabase**, hata varsa exception (store'a dokunulmaz), başarıda bellek içi store güncellenir.
- `repo.ts` içindeki tüm mutasyonlar bu yardımcılar üzerinden yazılır. İstemci iyimser (optimistic) yazma tamamen kaldırılır.
- Hata, çağıran ekranda toast ile kullanıcıya gösterilir.

### 2.4 Veri tazeliği ve çıkış temizliği
- `pullAll()`: ilk girişte, uygulama öne geldiğinde (`AppState` active), ağ dönünce, 60 sn'de bir ve önemli yazmalardan sonra (bordro kesinleştirme/geri alma, üye işlemleri, geri yükleme) çağrılır.
- `signOut`: bellek içi store boşaltılır, `firstSyncDone`/`initialSyncError` sıfırlanır, `tekstil:last-sync` temizlenir.
- `deleteAccountEverywhere`: Edge Function + oturum kapanışı sonrası cihazdaki `Documents/backups/` klasörü ve tüm eski AsyncStorage anahtarları (`tekstil:local-session`, `tekstil:local-accounts`, `tekstil:last-sync`, `tekstil:snapshot:*`) tamamen temizlenir.

## Faz 3 — Atomik Yedek Geri Yükleme (`restore_org_backup` RPC)

- `0007_data_protection.sql` içinde `restore_org_backup(p_payload JSONB)` — `SECURITY DEFINER`, tek transaction:
  1. Çağıranın `is_org_owner` olduğu firma belirlenir; değilse red.
  2. Payload içindeki tüm satırların `org_id`'si doğrulanır — başka firmanın yedeği reddedilir (`organizations` satırının `id`'si de eşleşmeli). Departman/takvim referansları da yine yedekteki kendi-org satırlarına işaret etmelidir.
  3. `app.bypass_payroll_lock = 'on'` birleşik bayrağı set edilir (bordro trigger muafiyeti).
  4. Eski iş verisi **koşulsuz** çocuk-önce sırayla silinir (kısmi yedekte bile kalıntı/FK hatası olmaz), yeni veriler ebeveyn-önce sırayla yazılır. `fill_defaults` yardımcısı eksik `NOT NULL DEFAULT` kolonlarını şema varsayılanıyla tamamlar (`jsonb_populate_recordset` eksik anahtara NULL basar).
  5. `org_members` yalnız upsert edilir (kullanıcıyı kilitleme riski); `auth.users`'ta olmayan kullanıcının üyelik satırı atlanır.
- İstemci (`src/export/excel.ts::restoreBackupFromText`): JSON'u ayrıştırır, temel doğrulama yapar, **tek RPC çağrısı** ile sunucuya gönderir, başarıda yalnız `await pullAll()` çağırır.

## Faz 4 — UI ve Yerel Güvenlik Yamaları

### 4.1 Silme onayları
- `src/app/ayarlar/takvim.tsx` (özel gün sil) ve `src/features/puantaj/StatusSheet.tsx` (yoklama kaydı sil) aksiyonlarına `ConfirmSheet` eklenir.

### 4.2 PIN güvenliği
- `src/state/settings.ts`: PIN düz metin yerine **SHA-256 özet** (`tekstil-pin:<pin>` öneki) saklanır; eski düz metin PIN'ler ilk açılışta tek seferlik hash'e taşınır.
- `src/app/kilit.tsx`: 5 ardışık hatalı denemede 30 saniye bekleme kilidi (geri sayımlı); başarılı girişte sayaç sıfırlanır.

## Faz 5 — Şifreli ve Şişmeyen Günlük Bulut Yedeği

- `.github/workflows/yedek.yml`:
  - Cron günlük: `0 3 * * *`.
  - Dump, `BACKUP_PASSPHRASE` secret'ı ile GPG simetrik (AES256) şifrelenir: `printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 --symmetric --cipher-algo AES256`; düz `.sql` silinir.
  - Yedek reposuna `git checkout --orphan` + `git push --force` ile **tek commit geçmişi** tutulur; klasörde yalnızca son **14** `.sql.gpg` dosyası saklanır.

---

## Doğrulama ve Süreç Kuralları

- Her faz sonrası ve topluca: `npx tsc --noEmit`, `npx expo lint`, `npx jest` sıfır hata.
- **0007 tümleşik doğrulaması (gerçek PostgreSQL 17, tek kullanımlık konteyner):** 7 migration sırayla sorunsuz uygulandı; ardından şu senaryolar doğrulandı — kesinleşmiş bordro DELETE/UPDATE redleri (owner ve admin), kalem tutar değişikliği red + `paid_amount` serbest, `kesinlesti→odendi` ve `revert_payroll` yasal geçişleri, geçmişli çalışan silme FK reddi, `restore_org_backup` yanlış-org reddi + eksik kolonlu/kısmi yedekle atomik geri yükleme + restore sonrası kilidin sürmesi, admin'in DELETE'inin sessizce 0 satır etkilemesi ve organizasyon cascade silmenin (kesinleşmiş bordro dahil) başarıyla tamamlanması.
- Yıkıcı şema değişiklikleri iki aşamalı uygulanır.
- Kodlama bitiminde en az 3 sub-agent ile bağımsız review: (1) DB & Güvenlik, (2) Veri Katmanı, (3) UI/Yedekleme/Test. Bulunan eksikler kapatılır.
- Review notu: `leave_adjustments`, `departments`, `schedule_days`, `calendar_events` DELETE'i kararlaştırılan 10 kritik tablo dışında üyelere açık bırakıldı (UI'da admin bu tabloları yönetebiliyor; kapsam bilinçli olarak korundu).
