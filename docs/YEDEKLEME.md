# Atölye Defteri — Çok Katmanlı Veri Güvenliği ve Yedekleme Kılavuzu

Bu belge, Atölye Defteri uygulamasının veri güvenliği mimarisini, otomatik yedekleme katmanlarını ve felaket kurtarma (disaster recovery) senaryolarını detaylandırır.

---

## 1. Çok Katmanlı Güvenlik Mimarisi

Uygulama, verilerin hiçbir koşulda kaybolmaması için **4 bağımsız katmanda** veri koruması sağlar:

```
┌────────────────────────────────────────────────────────────────────────┐
│ KATMAN 1: Cihaz İçi Otomatik Anlık Görüntüler (Local Snapshots)        │
│ • Her gün açılışta bir kez (24 saatte bir)                             │
│ • Uygulama sürümü değiştiğinde (güncelleme sonrası koruma)             │
│ • Geri yükleme işlemi yapılmadan hemen önce                            │
│ • Son 7 snapshot saklanır; bozuk dosyalar otomatik temizlenir          │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ KATMAN 2: Paylaşılabilir Manuel JSON Yedeği + Haftalık Hatırlatma       │
│ • Ayarlar > Hesap üzerinden tek dokunuşla dışa aktarım (Share/Save)    │
│ • Cuma 17:00 haftalık yerel bildirim ile kullanıcıyı teşvik            │
│ • Google Drive, e-posta, harici diske taşınabilir                      │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ KATMAN 3: Supabase Bulut Veritabanı (Canlı Çift Yönlü Senkron)         │
│ • Çevrimdışı öncelikli (offline-first) kuyruk ile otomatik aktarım     │
│ • Satır Düzeyinde Güvenlik (RLS) ile organizasyon izolasyonu           │
│ • `onAuthStateChange` ve açılışta otomatik `pullRemoteAll()`           │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ KATMAN 4: GitHub Actions Otomatik Uzak Dump (`tekstil-yedekler`)        │
│ • Her Pazartesi 03:00 UTC zamanlanmış tetikleyici + manuel tetikleme   │
│ • `npx supabase db dump`: Roller + Şema (public/auth) + Veriler       │
│ • Ayrı özel (private) depoya şifreli commit & push                     │
│ • Son 12 haftalık döküm saklama politikası (otomatik budama)           │
│ • Yan etki avantajı: Ücretsiz planın 7 günlük uykuya geçmesini önler   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Geri Getirme Senaryoları (Disaster Recovery)

### Senaryo 1 (S1): Cihaz Kaybı / Yeni Telefona Geçiş

**Problem:** Kullanıcının telefonu bozuldu, kayboldu veya yeni bir cihaza geçti.

**Çözüm:** Veriler Supabase bulutunda güvenle saklanmaktadır. Yeni cihaza kurulup oturum açıldığında veriler otomatik geri gelir.

**Adım Adım Kurtarma:**
1. Yeni telefona Atölye Defteri uygulamasını yükleyin.
2. Açılış ekranında önceki hesap yöntemiyle (**Google ile Devam Et** veya **E-posta & Şifre**) giriş yapın.
3. Oturum açıldığı anda `DataProvider` arka planda `pullRemoteAll()` işlemini başlatır:
   - Tüm çalışanlar (`employees`)
   - Günlük yoklamalar (`attendance`)
   - Maaş ve hakediş bordroları (`payroll`)
   - Borç ve avans kayıtları (`debts`)
   - Çalışma takvimi (`schedule_days`)
   - Şirket ayarları (`org_settings`)
4. Cihazdaki yerel `tekstil-db.json` veritabanı buluttaki güncel verilerle doldurulur ve uygulama kullanıma hazır hale gelir.

> **Önemli Not (Fotoğraflar):** Çalışan fotoğrafları mobil cihazın yerel dosya sisteminde (`file://...`) tutulur. Bulut veritabanına sadece metin ve rakam verileri senkronize edilir. Yeni cihazda çalışan kartları ve geçmişi eksiksiz gelir ancak profil fotoğraflarını yeniden seçmek gerekir.

---

### Senaryo 2 (S2): Uygulama Hatası / Yanlış İşlem / Bozuk Yerel Veritabanı

**Problem:** Hatalı bir toplu işlem yapıldı, yanlışlıkla çalışan/bordro silindi veya dosya sistemi bozuldu.

#### Yöntem 2A — Yerel Anlık Görüntüden (Snapshot) Dönme (En Hızlı Yol)
1. Uygulamada **Ayarlar → Hesap** ekranına gidin.
2. **"OTOMATİK YEREL YEDEKLER"** kartına bakın.
3. Listeden hatadan önceki bir tarih/saate ait anlık görüntünün yanındaki **"Geri Yükle"** düğmesine dokunun.
4. Sistem, mevcut veritabanınızın bir güvenlik kopyasını otomatik olarak alır ve seçilen snapshot'ı devreye sokar.
5. İşlem bittiğinde uygulama verileri anında yenilenir ve offline kuyruk üzerinden bulutla eşitlenir.

#### Yöntem 2B — Harici JSON Yedeğinden Geri Yükleme
1. **Ayarlar → Hesap** ekranında **"Yedekten Geri Yükle"** butonuna dokunun.
2. Telefonunuzdaki Dosyalar, Google Drive veya e-postanızdan daha önce indirdiğiniz `tekstil-yedek-*.json` dosyasını seçin.
3. Uygulama dosyanın şemasını ve bütünlüğünü doğrular, ardından veritabanını geri yükler.

#### Yöntem 2C — Yerel DB'yi Sıfırlayıp Buluttan Temiz Çekme
Yerel veritabanı tamamen bozulmuşsa:
1. Uygulamadan çıkış yapın veya uygulama verilerini temizleyin.
2. Tekrar giriş yaptığınızda Supabase bulutundaki temiz veriler otomatik olarak yerel veritabanına çekilir.

---

### Senaryo 3 (S3): Supabase Projesi Kaybı / Veritabanı Bozulması

**Problem:** Supabase projesi silindi, yanlışlıkla tablolar düşürüldü veya bağımsız bir Postgres sunucusuna geçiş yapılmak isteniyor.

Bu senaryoda GitHub Actions tarafından `tekstil-yedekler` deposuna haftalık olarak dökülen `.sql` dosyaları kullanılır.

#### Adım 1: Yedek SQL Dosyasını Alın
Özel depodaki en güncel yedeği klonlayın veya indirin:
```bash
git clone https://github.com/Muhammed2101812/tekstil-yedekler.git
cd tekstil-yedekler/yedekler
ls -lt dump-*.sql | head -n 1
# Örnek: dump-2026-10-13-0300.sql
```

#### Adım 2: Yeni Supabase Projesini Hazırlayın
1. [database.new](https://database.new) adresinden yeni bir Supabase projesi oluşturun.
2. Proje bağlantı dizesini (Connection String) alın:
   `Dashboard > Project Settings > Database > Connection string > URI` (veya Transaction Pooler URI).

#### Adım 3: Dökümü Veritabanına Geri Yükleyin
Döküm dosyası roller, şema ve verileri (auth ve public) tek parça halinde içerir:

```bash
# Değişkenleri tanımlayın
NEW_DB_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
LATEST_DUMP="dump-2026-10-13-0300.sql"

# psql ile geri yüklemeyi çalıştırın
psql "$NEW_DB_URL" -f "$LATEST_DUMP"
```

*Alternatif (Eğer migration yapısı ile adım adım gitmek isterseniz):*
```bash
# 1. Önce depodaki migration'ları yeni projeye uygulayın
npx supabase link --project-ref [YENI-PROJECT-REF]
npx supabase db push

# 2. Ardından dump dosyasındaki veri bloklarını psql ile yükleyin
psql "$NEW_DB_URL" -f "$LATEST_DUMP"
```

#### Adım 4: Mobil Uygulamanın Bağlantısını Güncelleyin
Proje `.env` dosyasını yeni Supabase URL ve anon key ile güncelleyin:
```env
EXPO_PUBLIC_SUPABASE_URL=https://[YENI-PROJECT-REF].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Yeni uygulama derlemesi yapın veya OTA güncellemesi (`eas update`) ile dağıtın. Kullanıcılar eski şifreleri veya Google hesaplarıyla oturum açtıklarında tüm verileri eksiksiz olarak karşılarında bulacaktır.

---

## 3. GitHub Actions Yedekleme Kurulumu (Kullanıcı Kontrol Listesi)

Otomatik haftalık yedeklerin çalışması için ana depoya (`Muhammed2101812/tekstil`) iki GitHub secret'ı tanımlanmalıdır:

1. **`SUPABASE_DB_URL`**:
   - Supabase Dashboard → Project Settings → Database → Connection string → URI (Pooler veya Direct).
   - Şifrenizi içeren tam bağlantı dizesi.
   - Komut satırından eklemek için:
     ```bash
     gh secret set SUPABASE_DB_URL --repo Muhammed2101812/tekstil
     ```

2. **`BACKUP_REPO_TOKEN`**:
   - GitHub → Settings → Developer Settings → Personal Access Tokens (Classic veya Fine-grained).
   - `Muhammed2101812/tekstil-yedekler` deposuna okuma/yazma (repo) izni olan bir token oluşturun.
   - Komut satırından eklemek için:
     ```bash
     gh secret set BACKUP_REPO_TOKEN --repo Muhammed2101812/tekstil
     ```

3. **Manuel Deneme Çalıştırması:**
   Secret'lar girildikten sonra workflow'u test etmek için:
   ```bash
   gh workflow run yedek.yml --repo Muhammed2101812/tekstil
   ```
   Çalışma durumunu izlemek için:
   ```bash
   gh run list --workflow=yedek.yml --repo Muhammed2101812/tekstil
   ```

---

## 4. Saklama Politikaları ve Güvenlik Özeti

| Katman | Konum | Saklama Süresi / Adet | Veri Türü | Hassasiyet |
|---|---|---|---|---|
| **Yerel Snapshot** | Cihaz (`Documents/backups/`) | Son 7 adet (eskiler silinir) | JSON | Cihazda yerel, şifresiz |
| **Manuel Dışa Aktarım** | Kullanıcının seçtiği harici alan | Kullanıcı kontrolünde | JSON | Kullanıcı sorumluluğunda |
| **Supabase Canlı** | AWS / Supabase Cloud | Sürekli canlı (canlı replika) | PostgreSQL RLS | Şifreli, RLS korumalı |
| **Uzak SQL Dump** | `tekstil-yedekler` (Gizli Depo) | Son 12 döküm (~3 ay) | SQL (DDL + Data) | GitHub Private Repo |

---

## 5. Bilinen Sınırlar

1. **Çalışan Fotoğrafları:** Mobil cihazlarda çekilen veya galeriden seçilen çalışan fotoğrafları cihazın yerel depolama alanında (`file:///data/user/0/...`) saklanır. Supabase Storage entegrasyonu henüz bağlanmadığı için bu fotoğraflar SQL dump veya JSON yedeğine dahil değildir. Cihaz değiştiğinde fotoğrafların tekrar yüklenmesi gerekir.
2. **Cihaz Kaybında Yerel Snapshot'lar:** Yerel anlık görüntüler telefon bozulduğunda telefonla birlikte kaybolur. Bu nedenle Katman 2 (Haftalık JSON) ve Katman 3-4 (Supabase & GitHub Actions) asıl kurtarma omurgasıdır.
3. **Eşzamanlı Düzenleme (Last-Write-Wins):** İki farklı cihazda aynı anda aynı kayıt değiştirilirse, sunucuya en son ulaşan güncelleme geçerli olur. Çakışma çözümünde önceki sürüm audit log haricinde saklanmaz.
