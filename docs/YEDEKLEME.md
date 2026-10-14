# Atölye Defteri — Veri Güvenliği ve Yedekleme Kılavuzu

Bu belge, Atölye Defteri uygulamasının veri güvenliği mimarisini, yedekleme katmanlarını ve felaket kurtarma (disaster recovery) senaryolarını detaylandırır. Mimari kurallar için `agent.md`, uygulama planı için `docs/VERI_GUVENLIGI_PLANI.md` dosyalarına bakınız.

---

## 1. Mimari Özet (Tamamen Online)

Uygulama **tamamen online (Supabase-first)** çalışır: cihaz modu, offline senkron kuyruğu ve yerel JSON DB dosyası kaldırılmıştır (bkz. `agent.md`). Her mutasyon önce `await` ile Supabase'e gider; başarıda bellek içi Zustand önbelleği güncellenir. Veri tazeliği; ilk girişte, uygulama öne gelince, ağ dönünce, 60 sn'de bir ve önemli yazmalardan sonra `pullAll()` ile sağlanır.

```
┌────────────────────────────────────────────────────────────────────────┐
│ KATMAN 1: Supabase Canlı Veritabanı (tek gerçek kaynak)                │
│ • RLS: firma izolasyonu; iş tablolarında DELETE yalnız Firma Sahibi    │
│ • employee_id FK'ları ON DELETE NO ACTION (zincirleme silme yok)       │
│ • Kesinleşmiş bordrolar trigger ile silinemez (revert_payroll ile)     │
│ • 14 tabloda audit log (kim, neyi, ne zaman; DELETE'te tam satır)      │
└────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│ KATMAN 2: Paylaşılabilir Manuel JSON Yedeği                            │
│ • Ayarlar → Hesap → "JSON Yedeği Al" (geri yüklenebilir tam yedek)     │
│ • Geri yükleme: restore_org_backup RPC — tek transaction, owner-only   │
└────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│ KATMAN 3: GitHub Actions Günlük Şifreli Dump (`tekstil-yedekler`)      │
│ • Her gün 03:00 UTC + manuel tetikleme                                 │
│ • GPG simetrik AES256 (BACKUP_PASSPHRASE); düz SQL asla commit edilmez │
│ • Orphan dal + force push: geçmiş tek commit, şişmez                   │
│ • Son 14 şifreli döküm saklanır                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Veri Koruma Kuralları (0007_data_protection.sql)

1. **Satır silme (DELETE) RLS'i** yalnızca Firma Sahibi'ne açıktır: `employees`, `attendance`, `attendance_days`, `overtime`, `debts`, `debt_payments`, `payrolls`, `payroll_items`, `salary_payments`, `employee_salaries`.
2. **Zincirleme silme yok:** `employee_id` FK'ları `ON DELETE NO ACTION` — geçmişi olan çalışan silinemez; personel yalnız pasifleştirilir (`active=false`).
3. **Kesinleşmiş bordro kilidi:** `status <> 'taslak'` bordro ve kalemleri doğrudan silinemez; yalnız `revert_payroll` RPC'si (owner + gerekçe) ile taslağa döner.
4. **Atomik geri yükleme:** `restore_org_backup(p_payload JSONB)` — owner doğrular, başka firmanın yedeğini reddeder, tek transaction'da eskiyi silip yedeği yazar.

---

## 3. Geri Getirme Senaryoları (Disaster Recovery)

### S1: Cihaz Kaybı / Yeni Telefon
Yeni cihaza uygulama kurulup aynı hesapla giriş yapılır; `pullAll()` tüm veriyi çeker. Yerel kalıcı veri olmadığından ek işlem gerekmez. (Çalışan fotoğrafları cihaz yerelindedir; yeniden seçilmelidir.)

### S2: Hatalı İşlem / Yanlış Silme / Veri Bozulması
1. **En hızlı yol — JSON yedeği:** Ayarlar → Hesap → "Yedekten Geri Yükle". Dosya, `restore_org_backup` RPC'sine tek çağrıyla gönderilir; sunucu tek transaction'da eski durumu yedekle değiştirir ve istemci `pullAll()` ile ekranı tazeler. Bu işlemi yalnızca Firma Sahibi yapabilir.
2. **Sunucu tarafı müdahale:** `audit_log` tablosunda her DELETE'in tam satır içeriği (`diff->'deleted'`) saklanır; tekil kayıtlar SQL ile geri getirilebilir.
3. **Kesinleşmiş bordro yanlış kesinleştiyse:** Uygulamadan "Bordroyu Geri Al" (owner + gerekçe) — `revert_payroll` ödemeleri ve taksit düşümlerini tersine çevirir.

### S3: Supabase Projesi Kaybı / Veritabanı Bozulması
`tekstil-yedekler` özel deposundaki günlük şifreli dökümler kullanılır (son 14 gün):

```bash
git clone https://github.com/Muhammed2101812/tekstil-yedekler.git
cd tekstil-yedekler/yedekler
ls -lt dump-*.sql.gpg | head -n 1

# 1) Şifre çöz — GPG parolayı interaktif sorar (terminal geçmişine kaydedilmez;
#    sorulduğunda BACKUP_PASSPHRASE secret'ının değerini girin)
gpg --decrypt -o dump.sql dump-2026-XX-XX-XXXX.sql.gpg

# 2) Yeni Supabase projesi oluştur (database.new) ve bağlantı URI'sini al

# 3) Geri yükle
psql "$NEW_DB_URL" -f dump.sql

# 4) Uygulamayı yeni projeye bağla: .env güncelle
#    EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
#    Sonra yeni build veya eas update ile dağıt.
```

> Kayıp penceresi en fazla 1 gündür (günlük cron). Daha uzun geçmiş gerekirse yedek deposunun düzenli olarak dışa kopyalanması önerilir.

---

## 4. GitHub Actions Kurulum Kontrol Listesi

Ana depoda (`Muhammed2101812/tekstil`) üç secret tanımlı olmalıdır:

1. **`SUPABASE_DB_URL`** — Dashboard → Project Settings → Database → Connection URI.
2. **`BACKUP_REPO_TOKEN`** — `tekstil-yedekler` deposuna yazma izni olan PAT.
3. **`BACKUP_PASSPHRASE`** — dump şifreleme parolası. **Yedekten geri getirmek için gereklidir; güvenli bir yerde saklayın.** Kaybedilirse mevcut şifreli yedekler açılamaz.

Manuel deneme: `gh workflow run yedek.yml --repo Muhammed2101812/tekstil`

---

## 5. Saklama Politikaları

| Katman | Konum | Saklama | Biçim |
|---|---|---|---|
| Canlı veri | Supabase (AWS) | Sürekli | PostgreSQL + RLS |
| Manuel JSON | Kullanıcının seçtiği yer | Kullanıcı kontrolünde | JSON (geri yüklenebilir) |
| Günlük dump | `tekstil-yedekler` (gizli depo) | Son **14** döküm, tek commit geçmişi | `.sql.gpg` (AES256) |

## 6. Bilinen Sınırlar

1. **Çalışan fotoğrafları** cihaz yerel dosya sisteminde kalır; buluta ve dump'a dahil değildir (Supabase Storage henüz bağlı değil).
2. **Son-yazan-kazanır:** iki cihazda aynı kayıt aynı anda değişirse sunucuya son ulaşan geçerli olur; önceki sürüm yalnız audit log'da vardır.
3. **Günlük yedek penceresi:** bulut tarafındaki bir kaza son 24 saate kadar veriyi geri getiremez; kritik dönemlerde manuel JSON yedeği alın.
