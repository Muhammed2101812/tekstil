import React, { useState } from 'react';
import {
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router } from 'expo-router';
import {
  CalendarCheck,
  FileSpreadsheet,
  Wallet,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AtelierLogo, Button, GoogleIcon, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';
import { hapticLight } from '../../utils/haptics';

const FEATURES = [
  {
    icon: CalendarCheck,
    title: 'Günlük puantaj',
    desc: 'Yoklamayı birkaç dokunuşla tamamlayın. Geç gelme, izin ve mesai aynı yerde.',
  },
  {
    icon: Wallet,
    title: 'Avans ve borç takibi',
    desc: 'Verilen avanslar ve taksitler kalan bakiyeyle birlikte takip edilir.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Bordro ve raporlar',
    desc: 'Ay sonu hakediş tek dokunuşla; Excel cetveli ve PDF maaş pusulası.',
  },
] as const;

/** Karşılama ekranı — marka, üç temel işlev ve giriş seçenekleri. */
export default function Hosgeldin() {
  const { c, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { isGoogleConfigured, signInWithGoogle } = useAuth();
  const { showToast } = useToast();
  const [googleBusy, setGoogleBusy] = useState(false);

  const onGooglePress = async () => {
    setGoogleBusy(true);
    const err = await signInWithGoogle();
    setGoogleBusy(false);
    if (err) {
      showToast({ message: err, tone: 'warning' });
    }
  };

  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(insets.top, statusBarHeight, Platform.OS === 'ios' ? 44 : 28);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: c.background,
          paddingTop: topInset + 16,
          paddingBottom: Math.max(insets.bottom, 20) + 8,
        },
      ]}
    >
      {/* Marka */}
      <View style={styles.brandRow}>
        <AtelierLogo size={44} />
        <View style={styles.brandCol}>
          <Text style={[type.headlineSm, { color: c.text }]}>Atölye Defteri</Text>
          <Text style={[type.bodySm, { color: c.textMuted, marginTop: 2 }]}>
            Puantaj, avans ve bordro defteri
          </Text>
        </View>
      </View>

      {/* İşlevler */}
      <View style={styles.features}>
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <View key={f.title} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: c.primarySoft }]}>
                <Icon size={20} color={c.primary} strokeWidth={2.1} />
              </View>
              <View style={styles.featureText}>
                <Text style={[type.titleMd, { color: c.text }]}>{f.title}</Text>
                <Text style={[type.bodySm, { color: c.textSecondary, marginTop: 2 }]}>
                  {f.desc}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Giriş seçenekleri */}
      <View style={styles.actions}>
        {isGoogleConfigured ? (
          <Button
            label={googleBusy ? 'Giriş yapılıyor…' : 'Google ile devam et'}
            variant="secondary"
            icon={<GoogleIcon size={18} />}
            onPress={onGooglePress}
            loading={googleBusy}
            disabled={googleBusy}
          />
        ) : null}
        <Button
          label="Hesap Oluştur"
          onPress={() => {
            hapticLight();
            router.push('/(auth)/kayit');
          }}
        />
        <Button
          label="Giriş Yap"
          variant="secondary"
          onPress={() => {
            hapticLight();
            router.push('/(auth)/giris');
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  brandCol: {
    justifyContent: 'center',
  },
  features: {
    flex: 1,
    justifyContent: 'center',
    gap: 28,
    paddingVertical: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  actions: {
    gap: 10,
  },
});
