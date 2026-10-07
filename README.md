# Atölye Defteri — Tekstil Personel Takip Uygulaması

Tekstil atölyesi sahibi/muhasebecisi için personel, puantaj, avans-borç ve
**net** maaş takibi. Kapsam ve tasarım kararları için bkz. [`docs/PLAN.md`](docs/PLAN.md)
(onaylı v2 planı).

## Özellikler

- **Personel:** çalışan kartları, departmanlar, maaş geçmişi/zam, işten çıkış, TCKN/IBAN doğrulama
- **Puantaj:** günlük yoklama (geldi/gelmedi/geç/erken/yarım gün/izin/rapor), toplu işlem,
  gün tamamlama, ay ısı haritası; tatil günlerinde yoklama girilmez
- **Çalışma takvimi:** haftalık program + molalar, resmî tatiller (2026–2030 gömülü),
  arife yarım günleri, ücretli/ücretsiz firma tatili, hafta sonu ek çalışma planlama
- **Avans & Borç:** taksitlendirme (önce eski borç kapanır), elden tahsilat, ödeme çizelgesi
- **Maaş (net):** yöntem A/B saatlik ücret, gün bazlı kesinti, kıst hesap (maaş/30),
  ay ortası zam, mesai çarpanları, "Nasıl hesaplandı?" satır satır döküm,
  atomik kesinleştirme/geri alma, ödeme takibi, farkı borca çevirme
- **Yıllık izin:** kıdem + yaş istisnaları (İş Kanunu md. 53), devreden bakiye
- **Raporlar:** puantaj cetveli, bordro özeti, pusula PDF'i, borç/mesai/izin Excel'leri,
  devamsızlık analizi, tam yedek (Excel + **geri yüklenebilir JSON**)
- **Güvenlik:** Supabase RLS (firma izolasyonu), uygulama kilidi (biyometrik + PIN),
  audit log, hesap silme (Play zorunluluğu), 6 haneli davet kodları
- **Çevrimdışı:** önce-yerele-yaz + idempotent senkron kuyruğu (UUID upsert),
  çevrimdışı şeridi, iyimser arayüz

## İki çalışma modu

| Mod | Ne zaman | Veri |
|---|---|---|
| **Cihaz modu** | `.env` boşsa (varsayılan) | Yalnızca telefonda (JSON dosya) — anında deneme için |
| **Supabase modu** | `.env` doluysa | Bulut + offline kuyruk + çift yönlü senkron |

Cihaz modunda kayıt/giriş yereldir (tek cihaz). Buluta geçmek için `supabase/README.md`'deki
adımları izleyin: iki proje (dev/prod) → `db push` → `.env` → `gen types`.

## Kurulum

```bash
npm install
cp .env.example .env        # Supabase kullanacaksanız doldurun
npx expo start              # Expo Go ile telefonda açın
```

### Doğrulama komutları (her değişiklikten sonra)

```bash
npx tsc --noEmit            # tip kontrolü
npx expo lint               # lint (0 hata)
npx jest                    # 40 test: domain(24) + veri katmanı(4) + bileşen/doğrulama(12)
npx expo export --platform android   # paketleme kontrolü
# Supabase'li RLS testleri (uzak proje gerekir):
SUPABASE_TEST_URL=… SUPABASE_TEST_ANON_KEY=… npx jest supabase/tests
# Uçtan uca (cihazda): maestro test .maestro/
```

### EAS derlemesi

```bash
npx eas-cli login
npx eas-cli build --profile preview --platform android   # iç test APK
npx eas-cli build --profile production --platform android # Play AAB
```

Google Play'e çıkış kontrol listesi PLAN.md **Faz 7**'dedir (kapalı test kuralı,
gizlilik politikası, hesap silme sayfası, veri güvenliği formu).

## Mimari

```
src/
├── app/          # Expo Router ekranları (yalnızca ekranlar)
├── domain/       # Saf hesaplama motoru — jest ile testli
│   ├── schedule  # takvim çözümleyici (tatil, arife, ek çalışma)
│   ├── wage      # saatlik ücret (A/B), kıst, zam dönemleri
│   ├── attendance# durum → kesinti
│   ├── payroll   # aylık net maaş birleştirici
│   ├── debts     # taksit önerisi + eski-borç-önce dağıtımı
│   └── leave     # yıllık izin hakkı
├── data/         # offline-first depo (zustand + dosya), repo işlemleri,
│                 # idempotent senkron kuyruğu, auth (Supabase|cihaz)
├── ui/           # tasarım sistemi bileşenleri (açık/koyu tema)
├── features/     # ekran-yardımcısı bileşenler (durum sayfası, bordro hesap)
├── export/       # PDF (expo-print) · Excel (xlsx) · JSON yedek/geri yükleme
├── theme/        # "Lacivert & Mercan" token'ları
├── state/        # küçük arayüz tercihleri (tema, kilit)
└── utils/        # para/tarih biçimleri, TCKN/IBAN, zod şemaları, bildirim
supabase/
├── migrations/   # 0001 şema → 0002 RLS → 0003 RPC → 0004 audit
├── functions/    # delete-account (Edge)
└── tests/        # RLS + finalize atomiklik testleri (uzak proje)
```

### Önemli tasarım kararları

- **Tüm satır id'leri istemcide üretilir** (UUID). Yoklama/bordro kayıtları
  *deterministik* UUID kullanır → aynı kaydın tekrar gönderimi ve iki cihazın
  çakışması upsert'te tek satırda birleşir (PLAN 9 idempotency).
- **Bordro kesinleştirme** Supabase modunda `finalize_payroll` RPC'siyle atomiktir
  (anlık görüntü + taksit düşümü tek işlemde); geri alma yalnızca firma sahibinde.
- **Son yazan kazanır** eşzamanlılık stratejisi audit log ile desteklenir (PLAN 8).
- Ekran metinleri Türkçe ve sade; çoklu dil için `src/i18n/tr.ts` ayrımı ileri
  sürüme bırakıldı (PLAN 13).

## Bilinen sınırlar / yol haritası

- Uygulama ikonu/feature graphic hâlen Expo varsayılanı — PLAN 7.6'daki
  "makara + onay" logosu kullanıcı onayına bağlı (Faz 0 mockup kararı).
- RLS testleri uzak Supabase projesi ister; ortam değişkeni yoksa atlanır.
- Hata izleme (Sentry) ve Play çıkış adımları Faz 6–7 kapsamındadır.
- Tek cihazlı "cihaz modu" senkron sunmaz; cihaz değiştirmek için JSON yedek/geri yükleme kullanılır.
