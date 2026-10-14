# Veri Güvenliği İnceleme Raporu — 14 Ekim 2026

Kapsam: istemci veri katmanı (`src/data/`, `src/export/`, `src/state/`), Supabase şema/RLS/RPC/edge function'lar (`supabase/`), yedekleme iş akışı (`.github/workflows/yedek.yml`, `docs/YEDEKLEME.md`) ve UI'daki silme akışları. Odak: verilerin yanlışlıkla silinmesine / kaybolmasına karşı koruma.

---

## 1. Yönetici Özeti

Proje, veri güvenliğini **4 katmanlı bir mimari** ile sağlıyor ve tasarımda önemli özenler var (RLS ile firma izolasyonu, audit log, offline-first idempotent senkron, çok katmanlı yedek). Personel kaydı UI'dan hiç sert silinemiyor (yalnız pasifleştirme), hesap silmeleri `holdToConfirm` ile korunuyor ve borç silme "ödemesi varsa silinemez" kuralıyla kısıtlı.

Ancak **"yanlışlıkla silinme" senaryosuna karşı en zayıf nokta UI değil, veritabanı politikaları**: RLS, firmaya üye **herhangi bir kullanıcının (admin dahil)** tüm iş verilerini tek API çağrısıyla satır satır silmesine izin veriyor ve CASCADE zincirleri sayesinde bir çalışan silindiğinde puantajı, borçları ve bordro kalemleri de gidiyor. İkinci kritik boşluk: JSON/snapshot **geri yükleme Supabase modunda buluta yayılmıyor** — yani yedekten dönüş, verinin bulutta olduğu senaryoda kalıcı olmuyor. Üçüncüsü: haftalık yedek doğrulanmıyor ve şifresiz.

Aşağıdaki bulgular öncelik sırasına göre düzenlidir; her biri için kanıt (dosya:satır) ve somut öneri verilir.

---

## 2. Mevcut Koruma Katmanları (neyi doğru yapıyor)

### 2.1 Erişim kontrolü ve kimlik doğrulama

| Koruma | Nerede | Not |
|---|---|---|
| Supabase Auth (e-posta+şifre, Google OAuth) | `src/data/auth.tsx` | İstemcide yalnız `anon` key; tüm yetki RLS'de |
| Firma (org) izolasyonu — RLS | `supabase/migrations/0002_rls.sql` | `current_user_org_ids()` SECURITY DEFINER, `USING` + `WITH CHECK` her tabloda |
| INSERT/DELETE korumalı tablolar | `0002_rls.sql:16-27` | `organizations` ve `org_members` için INSERT/DELETE doğrudan kapalı; yalnız RPC/edge function ile |
| Üye yönetimi owner-only | `0006_user_management.sql:45-53` | `is_org_owner()` ile üye silme/güncelleme yalnız firma sahibinde |
| 1:1 firma kuralı | `0006:12-21` | `org_members.user_id UNIQUE` — bir kullanıcı tek firmada |
| Edge function JWT doğrulaması | `supabase/functions/*` | `admin-create-user`, `admin-set-password`, `delete-account` — service_role yalnız sunucuda |
| Uygulama kilidi | `src/app/kilit.tsx`, `ayarlar/guvenlik.tsx` | Biyometrik / 4 haneli PIN, otomatik kilit |
| Cihaz modu parola özeti | `auth.tsx:60-64` | SHA-256 özet, sunucuya gitmiyor |

### 2.2 Veri bütünlüğü

- **Offline-first senkron**: her yazma önce yerel DB'ye, sonra kuyruğa (`src/data/store.ts:66-95`); id-aralıklı upsert ile idempotent (`supabase.ts:77-89`), istemci UUID'leri çakışma oluşturmuyor.
- **Atomik RPC'ler**: `finalize_payroll` / `revert_payroll` / `upsert_attendance_bulk` tek işlemde çalışır (`0003_functions.sql`). Bordro geri alma yalnız owner + gerekçe zorunlu (`0003:261-282`).
- **Şema kısıtları**: CHECK (durum/tür/rol enum'ları), UNIQUE (`attendance(employee_id, day)`, `payrolls(org_id, year, month)`, `overtime.client_ref`), FK'ler.
- **Denetim izi**: 14 tabloda INSERT/UPDATE/DELETE tetikleyicisi; **DELETE kayıtlarının tam satır içeriği** `audit_log.diff` içinde saklanır (`0004_audit.sql:12-15`) — silinen satır manuel olarak geri getirilebilir. `audit_log` RLS ile üyelere salt-okunur.

### 2.3 Yedekleme (4 katman, `docs/YEDEKLEME.md`)

1. **Cihaz içi snapshot**: günlük + sürüm değişiminde + geri yükleme öncesi otomatik (`src/data/snapshot.ts:269-301`); son 7 snapshot, JSON bütünlük kontrolü ve bozuk dosya temizliği.
2. **Manuel JSON/Excel dışa aktarım**: `ayarlar/hesap.tsx`; geri yükleme öncesi otomatik `pre-restore` snapshot'ı.
3. **Supabase canlı senkron**: 60 sn'de bir, ağ dönünce, uygulama öne gelince (`DataProvider.tsx:69-140`).
4. **GitHub Actions haftalık dump**: roller+şema+veri tek SQL, özel depoya push, son 12 döküm (`yedek.yml`).

### 2.4 UI'daki silme akışlarındaki korumalar

- Personel: UI'da **sert silme yok** — yalnız `deactivateEmployee` (soft delete, `repo.ts:274-279`).
- Borç: ödemesi varsa silinemez (`repo.ts:431-437`).
- Üye çıkarma: owner-only, kendini/sahibi çıkaramama (`repo.ts:641-658`, sunucu tarafında da RLS zorluyor).
- Hesap silme: `holdToConfirm` + "geri alınamaz" uyarısı (`hesap.tsx:247-263`).

---

## 3. Bulgular (öncelik sırasıyla)

### F1 (Yüksek) — RLS'de DELETE her üyeye açık + CASCADE zinciri

**Kanıt:** `0002_rls.sql` — `employees_all`, `attendance_all`, `payrolls_all` vb. tüm `FOR ALL` politikaları DELETE'i de kapsıyor ve rol ayrımı yok (admin = owner yetkisi). `0001_schema.sql:100-141` — `attendance.employee_id`, `employee_salaries.employee_id`, `debts.employee_id` hepsi `ON DELETE CASCADE`; `payroll_items.payroll_id` ve `salary_payments.payroll_item_id` de CASCADE.

**Risk:** Uygulama arayüzü personeli sert silmese de, firmaya üye **herhangi bir kullanıcının** (veya cihazı ele geçirilmiş bir adminin) tek bir `supabase.from('employees').delete()` çağrısı — bir bug, kötü niyetli bir deneme veya yanlış yazılmış bir senkron kodu sonucu — tüm puantaj/borc/bordro geçmişini CASCADE ile silebilir. `organizations` DELETE'i RLS ile kapalı (doğru), ama satır bazlı silme tamamen açık. Tek şans: `audit_log`'da silinen satırların tam kopyası var — manuel kurtarma mümkün ama acı verici.

**Öneri (en küçük etkili değişiklik):**
1. Yeni migration'da yüksek değerli tabloların DELETE politikasını `is_org_owner(org_id)` ile kısıtla: `employees`, `attendance`, `attendance_days`, `overtime`, `debts`, `debt_payments`, `payrolls`, `payroll_items`, `salary_payments`, `employee_salaries`. (Upsert/INSERT her üyede kalabilir — günlük kullanım bunu gerektiriyor.)
2. Kesinleşmiş/ödenmiş bordroyu satır silinmesine karşı trigger ile koru: `payrolls`/`payroll_items` üzerinde `BEFORE DELETE ... WHEN (OLD.status <> 'taslak')` → EXCEPTION; geri alma yalnız `revert_payroll` RPC'sinden.
3. Orta vadede: `deleted_at TIMESTAMPTZ` soft-delete kolonu + istemcide "son silinenler / çöp kutusu (30 gün)" ekranı. Bu, yanlışlıkla silinmeyi tek başına çözen katmandır.

### F2 (Yüksek) — Yedekten geri yükleme Supabase modunda buluta yayılmıyor

**Kanıt:** `src/export/excel.ts:165-180` — `restoreFromJsonText` yalnız `replaceDB()` çağırır; `store.ts:61-64` — `replaceDB` kuyruğa hiçbir şey eklemez ve uzakta olmayan satırlar için delete de üretmez. Sonraki senkron döngüsünde `pullAll()` uzak satırları geri getirip üzerine yazar (`supabase.ts:110-118`, remote-wins merge). `docs/YEDEKLEME.md` S2'deki "işlem bittiğinde … offline kuyruk üzerinden bulutla eşitlenir" ifadesi kodla uyuşmuyor.

**Risk:** Kullanıcı hatalı bir işlemi geri almak için snapshot/yedek döndüğünde: (a) yedekte olmayan satırlar buluttan geri gelir (silinen kayıt "dirilir"), (b) yedekteki güncel haliyle geri gelen satırlar buluta asla gönderilmez, sonraki çekilişte buluttaki eski haliyle ezilir. Cihaz modunda sorun yok; bulut modunda geri yükleme fiilen geçicidir.

**Öneri:** Restore sonrası uzlaşma (reconciliation) adımı ekle: restore edilen DB'deki tüm satırları enqueue et + mevcut org'un buluttaki satır id'leri ile karşılaştırıp yedekte olmayanları delete op'u olarak kuyruğa yaz (ya da tek seferlik `restore_org_state` RPC'si yaz — sunucu tarafında eski durumu `audit_log`'dan/tek hareketle değiştirir). Ayrıca restore'dan sonra `LAST_SYNC_KEY`'i sıfırlamak pull'un hemen ezmesini engeller (geçici rahatlık).

### F3 (Orta-Yüksek) — Yedekleme haftalık, doğrulanmıyor ve şifresiz

**Kanıt:** `yedek.yml:5-6` (Pazartesi 03:00 UTC), `:97-100` (son 12 döküm). Dump, düz metin SQL olarak özel GitHub deposuna commit ediliyor; içinde TC kimlik no, IBAN, maaş, adres, telefon var (`employees` tablosu).

**Risk:** (a) Bulut tarafında bir kaza olursa son 7 güne kadar veri kaybı (kendi dokümanında belirtildiği üzere ücretsiz katmanda otomatik yedek yok). (b) Yedek hiçbir zaman geri yükleme testinden geçmiyor — bozuk/eksik dump ancak felaket anında fark edilir. (c) `BACKUP_REPO_TOKEN` PAT'si sızmışsa tüm müşteri verisi açıkta.

**Öneri:** Cron'u günlüğe çek (maliyeti düşük); dump'ı commit etmeden önce `age`/`gpg` ile şifrele ve anahtarı ayrı bir secret'ta tut; her ayın ilk haftası otomatik "restore drill" adımı ekle (boş bir geçici Supabase şemasına restore edip satır sayılarını karşılaştıran küçük bir job — başarısızlıkta issue açsın).

### F4 (Orta) — Çıkış yapma, senkron olmamış kayıtları sessizce düşürüyor

**Kanıt:** `auth.tsx:291-305` — `signOut` yerel DB'yi boşaltır ama kuyruğu temizlemez/boşaltmaz. `supabase.ts:77-89` — `flushQueue` upsert için satırı yerel DB'de arar; bulamazsa op'u yine de `ok` olarak işaretler ("satır yerelde yok — atlanabilir"). 

**Risk:** Çevrimdışı yapılan eklemeler/düzenlemeler kuyruktayken kullanıcı çıkış yaparsa: yerel DB boşalır, sonra giriş yapıldığında kuyruk flush edilir, satırlar yerelde bulunamadığı için **hiç gönderilmeden ok sayılır** — sessiz veri kaybı. (Delete op'ları satır varlığına bakılmadan gönderildiği için asimetrik davranış da üretir.)

**Öneri:** `signOut` içinde: `pending.length > 0` ise önce bir flush dene; hâlâ bekleyen varsa kullanıcıya "X kayıt henüz buluta gönderilmedi — çıkarsanız silinir" uyarısı ver ve onay iste. Ayrıca `flushQueue`'da satırı bulunamayan upsert op'u `ok` değil `failed`/atılan olarak ayrı loglanmalı.

### F5 (Düşük-Orta) — Tekil silmelerde onay/geri alma yok

**Kanıt:** `ayarlar/takvim.tsx:94-103` — "Sil" anında siler (ActionSheet onayı yok). `features/puantaj/StatusSheet.tsx:168-180` — yoklama "Kaydı Sil" anında.

**Risk:** Tek kayıt kaybı; 24 saate kadar snapshot farkıyla kurtarılabilir ama kullanıcı bunu bilmez/bulamaz.

**Öneri:** Her iki akıma `ConfirmSheet` ekle (proje zaten hesap silmede kullanıyor) veya "silindi — Geri Al" toast'u ile 5 sn undo penceresi sun.

### F6 (Orta, gizlilik) — Yerel veri ve PIN düz metin

**Kanıt:** `persist.ts` — `tekstil-db.json` şifresiz (TC, IBAN, maaş içerir). `state/settings.ts:44-52` — 4 haneli PIN düz metin AsyncStorage'da; `kilit.tsx` — hatalı PIN denemesinde sayaç/kilit yok.

**Risk:** Uygulama kilidi yalnızca arayüz seviyesinde koruma; root'lu cihazda, Android backup'ında veya dosya sistemi erişimiyle JSON doğrudan okunur.

**Öneri:** Yerel DB'yi (veya en azından hassas tabloları) `expo-secure-store`'da tutulan anahtarla şifrele (AES-GPG yerine basit tutmak için: anahtar SecureStore'da, gövde encrypted JSON). PIN'i hash'le + 5 hatalı denemeden sonra 30 sn bekleme ekle.

### F7 (Düşük-Orta) — Hesap silme: öncesinde yedek çıkarışı, sonrasında yerel kalıntı

**Kanıt:** `repo.ts:662-680` — `deleteAccountEverywhere` AsyncStorage anahtarlarını temizler ama `Documents/backups/` altındaki snapshot dosyalarına dokunmaz (`snapshot.ts` o dizine yazar). Sunucu tarafı: tek üyeli firmada tüm veri CASCADE ile kalıcı silinir (`delete-account/index.ts:60-67`).

**Risk:** İki yönlü: (a) kullanıcı yanlışlıkla hesabı silerse önünde yedek çıkarma adımı yok (veri kaybı); (b) "her şey silindi" denmesine rağmen cihazda snapshot JSON'ları ve fotoğraflar kalır (KVKK/GDPR yönünden eksik silme).

**Öneri:** Silme onayı öncesi "Önce JSON yedeği almak ister misiniz?" adımı; silme başarılı olduktan sonra `backups/` dizinini ve kuyruk dosyasını da temizle.

### F8 (Düşük) — Restore dosyasında org sahipliği doğrulaması yok

**Kanıt:** `excel.ts:165-180` — yalnız yapısal kontrol (employees/attendance dizisi mi). Başka bir firmanın yedeği restore edilirse yerel DB karışır; sonraki düzenlemeler RLS `WITH CHECK` tarafından reddedilir ve kuyruk kalıcı "gönderilemedi" durumuna takılır.

**Öneri:** Restore'da tüm satırların `org_id`'sinin kullanıcının üyesi olduğu firmayla eşleştiğini doğrula; uyuşmazsa reddet.

### F9 (Bilgi) — Diğer gözlemler

- `YEDEKLEME.md`'deki `pullRemoteAll()` diye geçen fonksiyon gerçekte `pullAll()` — doküman sürüklenmesi.
- RLS testleri gerçek projeye karşı çalışıyor ve env yoksa skip ediliyor (`rls.test.ts:11-19`); CI'da periyodik çalışmıyor. Ayrıca `afterAll`'daki `organizations.delete()` temizliği RLS delete politikası olmadığından fiilen başarısız (sessiz).
- Audit log istemciye hiç gösterilmiyor (`pullAll` tablo listesinde yok) — "kim neyi sildi" ekranı eklenmesi hem şeffaflık hem kurtarma için değerli olur; veri zaten oturuyor.
- Son-yazan-kazanır çakışma stratejisi bilinçli ve dokümante (YEDEKLEME.md §5.3); mevcut ölçekte kabul edilebilir.

---

## 4. Repo dışından doğrulanamayan noktalar

- Gerçek Supabase projesinin katmanı, PITR/manuel yedek ayarları ve e-posta onay ayarı (dashboard'da; repo dokümanı "ücretsiz katman, otomatik yedek yok" diyor).
- GitHub Secrets'ların (`SUPABASE_DB_URL`, `BACKUP_REPO_TOKEN`) tanımlı olduğu ve workflow'un gerçekten başarıyla çalıştığı — Action geçmişi kontrol edilmeli.
- `tekstil-yedekler` özel deposunun erişim izinleri.
