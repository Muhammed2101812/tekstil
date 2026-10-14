# agent.md — Projenin Kalıcı Kuralları

Bu dosya, Atölye Defteri (tekstil) projesinin değişmez mimari ve veri güvenliği kurallarını içerir. Kod yazan her ajan (insan veya yapay zekâ) bu kurallara uymak zorundadır.

## Mimari

1. **Uygulama tamamen online (Supabase-first) çalışır.** Yerel cihaz modu, offline senkron kuyruğu veya yerel JSON DB dosyası YOKTUR. Zustand store yalnızca bellek içi (in-memory) okuma önbelleğidir; kalıcılık katmanı değildir.
2. **Yazma Kuralı:** Hiçbir veri önce Zustand store'a yazılıp arkadan sunucuya gönderilmez. Her mutasyon önce `await` ile Supabase'e (veya RPC/Edge Function'a) gider; işlem başarılı dönerse store güncellenir. İstek başarısız olursa store güncellenmez ve hata kullanıcıya gösterilir.
3. **Veri tazeliği:** `pullAll()` ilk girişte, uygulama öne geldiğinde ve önemli yazma işlemlerinden sonra çağrılır.

## Veritabanı Güvenliği

1. İş tablolarında (`employees`, `attendance`, `attendance_days`, `overtime`, `debts`, `debt_payments`, `payrolls`, `payroll_items`, `salary_payments`, `employee_salaries`) **`DELETE` RLS politikası yalnız `is_org_owner(org_id)` içindir**; SELECT/INSERT/UPDATE tüm üyelere açıktır.
2. `employee_id` Foreign Key kısıtları **`ON DELETE NO ACTION`** olmak zorundadır (CASCADE yasak). Personel kaydı silinmez, yalnız pasifleştirilir (`active=false`); `deleted_at` kolonu eklenmez.
3. **Kesinleşmiş bordrolar doğrudan silinemez/değiştirilemez** (`payrolls`/`payroll_items` BEFORE DELETE/UPDATE trigger). Geri alma yalnızca `revert_payroll` RPC'si ile (owner + gerekçe). Trigger muafiyetleri: organizasyon cascade silme (delete-account; "organizations satırı yok" kontrolü) ve `app.bypass_payroll_lock='on'` birleşik sunucu bayrağı (`revert_payroll` ve `restore_org_backup` işlem başında açar).
4. Yedekten geri yükleme yalnızca `restore_org_backup` RPC'si ile sunucu tarafında, tek transaction'da yapılır; istemci satır satır yazmaz.
5. Şirket (`organizations`) ve üyelik (`org_members`) INSERT/DELETE işlemleri doğrudan istemciye kapalıdır; yalnız RPC/Edge Function üzerinden yapılır.

## Migrasyon Kuralı

1. Yıkıcı şema değişiklikleri iki aşamalı yapılır (önce plan/kontrol, sonra uygulama; mevcut veri korumalı).
2. Her değişiklik sonrası `npx tsc --noEmit`, `npx expo lint` ve `npx jest` sıfır hatayla geçmelidir.

## Diğer

- Kimlik doğrulama yalnız Supabase Auth (e-posta+şifre / Google). İstemcide yalnız `anon` anahtar bulunur; `service_role` yalnızca Edge Function'larda kullanılır.
- Uygulama kilidi PIN'i düz metin saklanmaz (SHA-256 özet); 5 hatalı denemede 30 sn bekleme kilidi uygulanır.
- Bulut yedekleri GPG (AES256) ile şifrelenir; düz SQL asla yedek deposuna commit edilmez.
