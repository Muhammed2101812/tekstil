# Denetim ve Uygulama Raporu: Google ile Giriş + Çok Katmanlı Yedekleme Sistemi
**Tarih:** 8 Ekim 2026  
**Uygulama:** Atölye Defteri (Expo SDK 57 / React Native, Supabase Offline-First)  
**Kapsam:** Görev A (Supabase Auth + Google Oturumu), Görev B (B1-B4 Çok Katmanlı Veri Güvenliği ve Yedekleme)

---

## 1. Yönetici Özeti

Bu geliştirme turunda kullanıcının uygulamayı Google Play'e yükleyip gerçek atölye verileriyle güvenle test edebilmesi ve olası güncelleme, arıza veya yanlış işlem durumunda hiçbir verinin kaybolmaması amacıyla iki ana sistem devreye alınmıştır:

1. **Google ile Giriş (Task A):** Expo SDK 57 uyumlu `expo-auth-session` ve `expo-web-browser` modülleri ile Supabase `signInWithIdToken` tabanlı, nonce doğrulamalı yerel OAuth akışı kuruldu. Cihaz modu ve eksik yapılandırma korumaları eklendi; giriş ve karşılama ekranlarına flat tasarım ilkelerine uygun Google giriş düğmeleri entegre edildi.
2. **Çok Katmanlı Veri Güvenliği ve Yedekleme (Task B):**
   - **B1 (Uzak Otomatik SQL Dump):** `Muhammed2101812/tekstil-yedekler` adında özel (private) bir GitHub deposu oluşturuldu. Her Pazartesi 03:00 UTC'de ve manuel tetiklemeyle (`workflow_dispatch`) çalışan, roller + şema + verileri döküp son 12 haftayı saklayan `.github/workflows/yedek.yml` iş akışı yazıldı.
   - **B2 (Uygulama İçi Otomatik Yerel Anlık Görüntüler):** 24 saatte bir, sürüm güncellemesinde ve geri yükleme öncesinde otomatik çalışan `takeSnapshot` altyapısı (`src/data/snapshot.ts`) geliştirildi. Ayarlar > Hesap ekranına snapshot listeleme ve tek tıkla geri yükleme eklendi.
   - **B3 (Haftalık Harici Yedekleme Hatırlatması):** Ayarlar > Bildirimler ekranına her Cuma 17:00'de kullanıcıyı cihaz dışı JSON yedeği almaya teşvik eden bildirim mekanizması eklendi.
   - **B4 & Dokümantasyon:** Felaket kurtarma senaryoları (S1, S2, S3) gerçek komutlarla `docs/YEDEKLEME.md` kılavuzunda belgelendi.

---

## 2. Değişen ve Eklenen Dosyalar

| Dosya | Durum | Açıklama |
|---|---|---|
| `package.json` & `package-lock.json` | Güncellendi | `expo-auth-session` (~57.0.14) ve `expo-web-browser` (~57.0.3) SDK 57 uyumlu sürümleri eklendi. |
| `app.json` | Güncellendi | `plugins` dizisine `"expo-web-browser"` eklendi. |
| `.env.example` | Güncellendi | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` değişkeni eklendi. |
| `src/ui/GoogleIcon.tsx` | Yeni | Flat tasarıma uygun resmi 4 renkli vektörel Google SVG ikonu. |
| `src/ui/index.ts` | Güncellendi | `GoogleIcon` dışa aktarıldı. |
| `src/data/auth.tsx` | Güncellendi | `signInWithGoogle` akışı (kriptografik nonce, Supabase `signInWithIdToken`, kullanıcı adı çözümü, cihaz modu koruması) ve temiz `signOut` eklendi. |
| `src/app/(auth)/hosgeldin.tsx` | Güncellendi | "Google ile devam et" butonu, yükleme durumu ve hata bildirimi. |
| `src/app/(auth)/giris.tsx` | Güncellendi | "Google ile devam et" butonu, ayraç ve cihaz modu durum uyarısı. |
| `src/app/_layout.tsx` | Güncellendi | `WebBrowser.maybeCompleteAuthSession()` modül başlatmasına eklendi. |
| `src/data/snapshot.ts` | Yeni | Yerel JSON anlık görüntü yöneticisi: yazma, listeleme, budama (son 7 adet), bozuk dosya temizleme, 24 saat / sürüm değişimi kontrolü ve test bağdaştırıcısı. |
| `src/data/DataProvider.tsx` | Güncellendi | Uygulama açılışında arka planda `checkAndTriggerAutoSnapshot()` tetiklemesi bağlandı. |
| `src/app/ayarlar/hesap.tsx` | Güncellendi | "Otomatik Yerel Yedekler" kartı, anlık görüntü listesi (tarih + boyut), manuel yedek alma ve geri yükleme onay modalı. |
| `src/export/excel.ts` | Güncellendi | `restoreFromJsonText` hem `{ db: ... }` sarmalayıcılı hem düz `DataDB` formatını destekleyecek ve statik import kullanacak şekilde güncellendi. |
| `src/utils/notifications.ts` | Güncellendi | `scheduleWeeklyBackupReminder` (Cuma 17:00, haftalık periyot) eklendi; yoklama bildirimiyle çakışmayacak benzersiz kimlikler tanımlandı. |
| `src/app/ayarlar/bildirimler.tsx` | Güncellendi | "Haftalık JSON Yedek Hatırlatması" kartı ve açma/kapatma tercihi eklendi. |
| `.github/workflows/yedek.yml` | Yeni | Supabase PostgreSQL veritabanı dökümünü alıp `tekstil-yedekler` özel deposuna arşivleyen otomatik iş akışı. |
| `docs/YEDEKLEME.md` | Yeni | Çok katmanlı yedekleme mimarisi, S1/S2/S3 kurtarma adımları ve komutları. |
| `__tests__/data/snapshot.test.ts` | Yeni | Yerel snapshot yazma, son 7'ye budama, bozuk JSON temizleme, 24 saat / sürüm yükseltme idempotency ve pre-restore testleri (5 test). |

---

## 3. Kullanıcının Yapması Gerekenler (Sıralı Kontrol Listesi)

> [!IMPORTANT]
> Aşağıdaki adımlar üçüncü parti servislerde (Google Cloud, Supabase, GitHub) kullanıcı kimlik doğrulaması gerektirdiğinden ve güvenlik gereği gizli anahtarlar barındırdığından kullanıcı tarafından tamamlanmalıdır.

### Adım 1: Supabase Access Token Rotasyonu
Önceki geliştirme turlarında konsola veya loglara yansımış olabilecek eski kişisel erişim belirteçlerini geçersiz kılın:
1. [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) sayfasına gidin.
2. Varsa eski token'ları silin (Revoke).
3. Yeni bir erişim belirteci oluşturun ve güvenli bir parola yöneticisine kaydedin (kod deposuna veya dokümanlara asla yazmayın).

### Adım 2: Google Cloud Console — OAuth İstemcisi
1. [console.cloud.google.com](https://console.cloud.google.com) adresine gidin ve projenizi seçin.
2. **APIs & Services → OAuth consent screen**:
   - User Type: **External** seçin.
   - Uygulama adı: "Atölye Defteri".
   - Destek ve geliştirici e-postasını girin, kaydedin.
3. **APIs & Services → Credentials → Create Credentials → OAuth Client ID**:
   - Application type: **Web application**.
   - Name: `Atolye Defteri Supabase Web Client`.
   - **Authorized redirect URIs** (Yetkili yönlendirme URI'leri):
     `https://rocnibznifkudlsqtatj.supabase.co/auth/v1/callback`
   - Oluşturulan **Client ID** ve **Client Secret** değerlerini not edin.

### Adım 3: Supabase Dashboard — Google Provider & Redirect URL
1. [supabase.com/dashboard](https://supabase.com/dashboard) projenize (`rocnibznifkudlsqtatj`) gidin.
2. **Authentication → Providers → Google**:
   - Provider'ı **Enabled** durumuna getirin.
   - **Client ID**: Adım 2'de aldığınız Google Client ID.
   - **Client Secret**: Adım 2'de aldığınız Google Client Secret.
   - Kaydedin (Save).
3. **Authentication → URL Configuration → Redirect URLs**:
   - Aşağıdaki yönlendirme şemalarını ekleyin:
     - `tekstil://**` (Standalone/üretim Android derlemesi için)
     - `exp://**` (Expo Go testleri için)

### Adım 4: Mobil Uygulama `.env` Dosyası
Yerel çalışma dizinindeki `.env` dosyasına Google Web Client ID'yi ekleyin (Web Client ID gizli bilgi değildir):
```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=buraya_google_client_id_yazilacak.apps.googleusercontent.com
```

### Adım 5: GitHub Secrets Yapılandırması (Uzak SQL Yedekleri İçin)
GitHub Actions workflow'unun (`yedek.yml`) çalışabilmesi için `Muhammed2101812/tekstil` deposuna 2 adet secret girilmelidir:
1. **`SUPABASE_DB_URL`**:
   - Supabase Dashboard → Project Settings → Database → Connection string → URI (Pooler veya Direct).
   - Örnek format: `postgresql://postgres.[PROJECT-REF]:[SIFRE]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
   - Terminalden ekleme: `gh secret set SUPABASE_DB_URL --repo Muhammed2101812/tekstil`
2. **`BACKUP_REPO_TOKEN`**:
   - GitHub → Settings → Developer Settings → Personal Access Tokens.
   - `Muhammed2101812/tekstil-yedekler` deposuna yazma (`repo` yetkisi) hakkı olan bir PAT oluşturun.
   - Terminalden ekleme: `gh secret set BACKUP_REPO_TOKEN --repo Muhammed2101812/tekstil`

### Adım 6: Workflow İlk Elle Çalıştırma
Secret'lar girildikten sonra döküm akışını test edin:
```bash
gh workflow run yedek.yml --repo Muhammed2101812/tekstil
```
Ardından `https://github.com/Muhammed2101812/tekstil-yedekler/tree/main/yedekler` dizininde ilk `.sql` dosyasının oluştuğunu doğrulayın.

---

## 4. Kalite Kapıları ve Test Sonuçları

Tüm kalite kapıları eksiksiz olarak çalıştırılmış ve başarıyla geçmiştir:

```bash
$ npx tsc --noEmit
# 0 hata. (TypeScript derleme tamamen temiz)

$ npx expo lint
# 0 hata, 0 uyarı. (ESLint ve React Hooks kuralları tamamen temiz)

$ npx jest
# PASS __tests__/domain/payroll.test.ts
# PASS __tests__/data/repo.test.ts
# PASS __tests__/data/snapshot.test.ts
# PASS __tests__/ui/components.test.tsx
# Test Suites: 4 passed, 1 skipped (canlı RLS testi), 5 total
# Tests:       52 passed, 4 skipped, 56 total
# Time:        2.084 s

$ npx expo export --platform android
# Android Bundled 39870ms node_modules/expo-router/entry.js (4154 modules)
# Hermes bytecode bundle üretildi: _expo/static/js/android/entry-*.hbc (9.8MB)
# Sonuç: BAŞARILI (exit code 0)
```

---

## 5. Geri Getirme Senaryoları Özeti (S1 / S2 / S3)

Detaylı komutlar ve kurtarma adımları `docs/YEDEKLEME.md` dosyasında yer almaktadır. Özet akış:

- **S1 (Cihaz Kaybı / Yeni Telefon):** Yeni cihaza uygulama kurulur. Supabase hesabıyla oturum açılır. Açılışta `pullRemoteAll()` çalışır ve tüm çalışanlar, takvim, yoklamalar, borçlar ve bordrolar otomatik olarak cihaza çekilir.
- **S2 (Bozuk Yerel Veri / Hatalı İşlem):** Ayarlar > Hesap > "Otomatik Yerel Yedekler" alanından son 7 snapshot'tan biri seçilerek anında geri dönülür. Sistem geri yükleme öncesi otomatik bir `pre-restore` yedeği alarak koruma sağlar. Alternatif olarak haftalık alınmış harici JSON yedeği telefondan seçilip yüklenir.
- **S3 (Supabase Projesi Kaybı / Felaket):** `tekstil-yedekler` özel deposundaki son `dump-*.sql` dosyası alınır. Yeni Supabase projesine `psql "$NEW_DB_URL" -f dump-*.sql` komutuyla basılır; auth kullanıcıları dahil tüm şema ve veriler eksiksiz geri döner. Uygulamanın `.env` URL/anahtar bilgisi güncellenir.

---

## 6. Bilinen Sınırlar ve Sonraki Adımlar

1. **Çalışan Fotoğrafları:** Mobil cihaz kamerasından veya galerisinden alınan fotoğraflar yerel cihaz dosya sisteminde (`file://...`) tutulmaktadır. Supabase Storage bağlanmadığı için cihaz değiştiğinde profil fotoğraflarının tekrar seçilmesi gerekir (operasyonel metin ve muhasebe verileri etkilenmez).
2. **Yerel Snapshot Kapsamı:** Cihaz içi snapshot'lar cihazın tamamen kırılması/kaybolması durumunda telefonda kalır. Bu nedenle harici bulut (Supabase), GitHub Actions uzak dökümleri ve haftalık JSON dışa aktarımı asıl güvencedir.
3. **Eşzamanlı Düzenleme:** Çoklu cihaz senaryosunda "son yazan kazanır" (last-write-wins) ilkesi geçerlidir.
4. **Hesap Eşleşmesi (Automatic Account Linking):** Bir kullanıcı önce e-posta ve şifre ile kaydolup daha sonra aynı e-posta adresine sahip Google hesabıyla "Google ile devam et" derse, Supabase kimliği otomatik olarak mevcut kullanıcıya bağlar; veri veya yetki kaybı yaşanmaz.
