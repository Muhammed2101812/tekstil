import React from 'react';
import { Text, View } from 'react-native';
import { Card, Chip, Header, Screen, SegmentedControl, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useOrg, useSchedule, useSettings } from '../../data/hooks';
import { updateOrgSettings } from '../../data/repo';
import { averageMonthlyHours } from '../../domain/schedule';
import { formatMoney } from '../../utils/format';
import type { OrgSettings } from '../../types';

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  const { c, type } = useTheme();
  return (
    <Card style={{ marginBottom: 12 }}>
      <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>{title}</Text>
      <Text style={[type.small, { color: c.textMuted, marginTop: 4, marginBottom: 10 }]}>{desc}</Text>
      {children}
    </Card>
  );
}

/** Hesaplama kuralları (PLAN 6.9): her seçeneğin altında sade açıklama + canlı örnek */
export default function AyarKurallar() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const settings = useSettings();
  const org = useOrg();
  const schedule = useSchedule();
  const monthly = averageMonthlyHours(schedule) || 195;
  const gunluk = formatMoney(Math.round((30000 / monthly) * 9 * 100) / 100);

  // Remote-first yazma: hata kullanıcıya toast ile gösterilir
  const set = (patch: Partial<OrgSettings>) => {
    updateOrgSettings(patch).catch((e) =>
      showToast({ message: e instanceof Error ? e.message : 'Kural kaydedilemedi', tone: 'warning' })
    );
  };

  return (
    <Screen>
      <Header title="Hesaplama Kuralları" back compact subtitle={org?.name} />
      <View style={{ marginTop: 12 }}>
        <Row
          title="Saatlik Ücret Yöntemi"
          desc="Yöntem A her ay aynı ücreti verir (önerilen); Yöntem B iş günü az olan ayda bir günlük devamsızlık daha pahalıya gelir."
        >
          <SegmentedControl
            options={[
              { value: 'ortalama_takvim', label: `A · Ortalama (${Math.round(monthly)} sa)` },
              { value: 'gercek_ay', label: 'B · O ayın saati' },
            ]}
            value={settings.hourlyWageMethod}
            onChange={(v) => set({ hourlyWageMethod: v as never })}
          />
          <Text style={[type.small, { color: c.textSecondary, marginTop: 10 }]}>
            Örnek: 30.000 ₺ maaşlı bir işçi 1 gün (9 sa) gelmediğinde kesinti ={' '}
            <Text style={{ fontWeight: '800', color: c.danger }}>{gunluk}</Text>
          </Text>
        </Row>

        <Row title="Mesai Çarpanları" desc="Hafta içi ve hafta sonu fazla çalışma ×1,5; resmî tatil çalışması ×2. Yasal sınırlara göre ayarlayın.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[1.5, 1.75, 2].map((m) => (
              <Chip
                key={m}
                label={`Hafta içi ×${String(m).replace('.', ',')}`}
                selected={settings.overtimeMultiplier === m}
                onPress={() => set({ overtimeMultiplier: m })}
              />
            ))}
            {[2, 2.5, 3].map((m) => (
              <Chip
                key={m}
                label={`Resmî tatil ×${String(m).replace('.', ',')}`}
                selected={settings.holidayOvertimeMultiplier === m}
                onPress={() => set({ holidayOvertimeMultiplier: m })}
              />
            ))}
          </View>
        </Row>

        <Row title="Geç Kalma" desc="Öneri: geç kalma sadece kayıt tutulur, maaştan kesilmez. Kesilmesini isterseniz dakika bazlı kesilir.">
          <SegmentedControl
            options={[
              { value: 'kayit', label: 'Sadece kayıt' },
              { value: 'kes', label: 'Maaştan kes' },
            ]}
            value={settings.deductLate ? 'kes' : 'kayit'}
            onChange={(v) => set({ deductLate: v === 'kes' })}
          />
        </Row>

        <Row title="Erken Çıkış / Saatlik İzin" desc="Çıkılan saatten mesai bitişine kadar kesinti yapılır.">
          <SegmentedControl
            options={[
              { value: 'kes', label: 'Kesinti yap' },
              { value: 'kayit', label: 'Sadece kayıt' },
            ]}
            value={settings.deductEarlyLeave ? 'kes' : 'kayit'}
            onChange={(v) => set({ deductEarlyLeave: v === 'kes' })}
          />
        </Row>

        <Row title="Raporlu Günler" desc="Varsayılan: raporlu gün maaştan düşülür (ücretini SGK öder). İlk 2 günü işveren ödesin seçeneği de var.">
          <SegmentedControl
            options={[
              { value: 'kes', label: 'Maaştan düş' },
              { value: 'odeme', label: 'Maaştan düşme' },
            ]}
            value={settings.deductSickLeave ? 'kes' : 'odeme'}
            onChange={(v) => set({ deductSickLeave: v === 'kes' })}
          />
          {settings.deductSickLeave ? (
            <View style={{ marginTop: 10 }}>
              <SegmentedControl
                options={[
                  { value: 'hayir', label: 'Tüm günler kesilir' },
                  { value: 'evet', label: 'İlk 2 günü işveren öder' },
                ]}
                value={settings.sickLeaveFirstTwoDaysEmployer ? 'evet' : 'hayir'}
                onChange={(v) => set({ sickLeaveFirstTwoDaysEmployer: v === 'evet' })}
              />
            </View>
          ) : null}
        </Row>

        <Row title="Hafta Tatili Kesintisi" desc="Kapalı önerilir: hafta içi mazeretsiz gelmeyenin o haftaki tatil ücreti de kesilir.">
          <SegmentedControl
            options={[
              { value: 'hayir', label: 'Uygulanmasın (öneri)' },
              { value: 'evet', label: 'Uygula' },
            ]}
            value={settings.weekRestPenalty ? 'evet' : 'hayir'}
            onChange={(v) => set({ weekRestPenalty: v === 'evet' })}
          />
        </Row>

        <Row title="Maaş Günü" desc="Ana sayfadaki maaş günü hatırlatması için ayın günü.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[1, 5, 10, 15, 20, 'son'].map((d) => {
              const val = d === 'son' ? 31 : (d as number);
              return (
                <Chip
                  key={String(d)}
                  label={d === 'son' ? 'Ayın sonu' : String(d)}
                  selected={settings.paydayOfMonth === val}
                  onPress={() => set({ paydayOfMonth: val })}
                />
              );
            })}
          </View>
        </Row>
        <View style={{ height: 20 }} />
      </View>
    </Screen>
  );
}
