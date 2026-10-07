import React from 'react';
import { Text, View } from 'react-native';
import { Card, Header, Screen, SectionHeader, SegmentedControl } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemeStore } from '../../state/settings';

/** Görünüm (PLAN 6.9): Açık / Koyu / Sistem + yazı boyutu önizleme */
export default function AyarGorunum() {
  const { c, type, dark } = useTheme();
  const mode = useThemeStore((s) => s.themeMode);
  const setMode = useThemeStore((s) => s.setThemeMode);

  return (
    <Screen>
      <Header title="Görünüm" back compact />
      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={[type.body, { color: c.text, fontWeight: '700', marginBottom: 10 }]}>Tema</Text>
          <SegmentedControl
            options={[
              { value: 'system', label: 'Sistem' },
              { value: 'light', label: 'Açık' },
              { value: 'dark', label: 'Koyu' },
            ]}
            value={mode}
            onChange={(v) => setMode(v as never)}
          />
          <Text style={[type.small, { color: c.textMuted, marginTop: 10 }]}>
            Şu an {dark ? 'koyu' : 'açık'} tema görüyorsunuz. Durum renkleri her iki temada da erişilebilir.
          </Text>
        </Card>

        <SectionHeader title="YAZI BOYUTU ÖNİZLEMESİ" />
        <Card>
          <Text style={[type.display, { color: c.text }]}>Gövde 32</Text>
          <Text style={[type.title, { color: c.text, marginTop: 6 }]}>Başlık 22</Text>
          <Text style={[type.body, { color: c.text, marginTop: 6 }]}>Gövde metni 16 — Ayşe Yılmaz</Text>
          <Text style={[type.small, { color: c.textSecondary, marginTop: 6 }]}>Küçük metin 14 — departman, notlar</Text>
          <Text style={[type.money, { color: c.success, marginTop: 8 }]}>₺28.615,38</Text>
          <Text style={[type.small, { color: c.textMuted, marginTop: 10 }]}>
            Daha büyük yazı için telefonun sistem yazı boyutu ayarını kullanın; düzen bozulmaz.
          </Text>
        </Card>
        <View style={{ height: 30 }} />
      </View>
    </Screen>
  );
}
