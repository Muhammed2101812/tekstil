import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { Delete, Fingerprint, Lock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useThemeStore, hashPin, pinLockRemaining } from '../state/settings';
import { hapticLight, hapticSuccess, hapticWarning } from '../utils/haptics';

/** Uygulama kilidi: Biyometrik / PIN koruması (Sade, simetrik & zarif tuş takımı) */
export default function Kilit() {
  const { c, type } = useTheme();
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(insets.top, statusBarHeight, Platform.OS === 'ios' ? 44 : 28);
  const pinHash = useThemeStore((s) => s.appLockPinHash);
  const registerPinAttempt = useThemeStore((s) => s.registerPinAttempt);
  const pinLockUntil = useThemeStore((s) => s.pinLockUntil);
  const setLocked = useThemeStore((s) => s.setLocked);
  const [entered, setEntered] = useState('');
  const [error, setError] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const bioTried = useRef(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);

  // Bekleme kilidi geri sayımı (Date.now yalnız store yardımcısında — render saf kalır)
  useEffect(() => {
    const calc = () => setRemaining(pinLockRemaining());
    calc();
    const t = setInterval(calc, 500);
    return () => clearInterval(t);
  }, [pinLockUntil]);

  const locked = remaining > 0;

  const unlock = () => {
    hapticSuccess();
    registerPinAttempt(true);
    setLocked(false);
    router.replace('/(tabs)');
  };

  const tryBiometrics = async () => {
    try {
      const hasBio = await LocalAuthentication.hasHardwareAsync();
      const saved = await LocalAuthentication.isEnrolledAsync();
      if (hasBio && saved) {
        setHasBiometrics(true);
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Uygulamayı açmak için doğrulayın',
          fallbackLabel: 'PIN kullan',
        });
        if (res.success) unlock();
      }
    } catch {
      // Biyometrik hata aldığında PIN'e devam
    }
  };

  useEffect(() => {
    if (!bioTried.current) {
      bioTried.current = true;
      tryBiometrics();
    }
    // PIN özeti boş/bozuksa kullanıcıyı kilide kilitli bırakma — kilidi güvenle kapat
    if (!pinHash || pinHash.length < 32) {
      useThemeStore.getState().setAppLock(false, null);
      useThemeStore.getState().setLocked(false);
      router.replace('/(tabs)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = async (d: string) => {
    if (locked) return; // bekleme kilidi aktif — tuş takımı kapalı
    hapticLight();
    const next = (entered + d).slice(0, 4);
    setEntered(next);
    setError(false);
    if (next.length === 4) {
      const digest = await hashPin(next);
      if (pinHash && digest === pinHash) {
        unlock();
      } else {
        hapticWarning();
        setError(true);
        registerPinAttempt(false); // 5 hatalı denemede 30 sn kilit (settings.ts)
        setRemaining(pinLockRemaining());
        setTimeout(() => setEntered(''), 350);
      }
    }
  };

  const deleteOne = () => {
    hapticLight();
    setEntered((prev) => prev.slice(0, -1));
    setError(false);
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: c.background,
          paddingTop: topInset + 20,
          paddingBottom: Math.max(insets.bottom, 24),
        },
      ]}
    >
      {/* ÜST İKON VE BAŞLIK */}
      <View style={styles.topSection}>
        <View style={[styles.lockIconBox, { backgroundColor: c.primarySoft }]}>
          <Lock size={32} color={c.primary} strokeWidth={2.4} />
        </View>
        <Text style={[type.title, { color: c.text, marginTop: 16 }]}>Uygulama Kilitli</Text>
        {locked ? (
          <Text style={[type.small, { color: c.danger, marginTop: 4, fontWeight: '700' }]}>
            Çok fazla hatalı deneme — {Math.ceil(remaining / 1000)} saniye bekleyin
          </Text>
        ) : (
          <Text style={[type.small, { color: c.textMuted, marginTop: 4 }]}>
            Devam etmek için 4 haneli PIN girin
          </Text>
        )}

        {/* PIN NOKTALARI */}
        <View style={styles.dots}>
          {[0, 1, 2, 3].map((i) => {
            const isFilled = entered.length > i;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: error
                      ? c.danger
                      : isFilled
                      ? c.primary
                      : c.border,
                    borderColor: error ? c.danger : isFilled ? c.primary : 'transparent',
                    transform: [{ scale: isFilled ? 1.2 : 1 }],
                  },
                ]}
              />
            );
          })}
        </View>

        {error && !locked ? (
          <Text style={[type.small, { color: c.danger, marginTop: 12, fontWeight: '600' }]}>
            PIN hatalı, lütfen tekrar deneyin
          </Text>
        ) : null}
      </View>

      {/* SİMETRİK DAİRESEL TUŞ TAKIMI */}
      <View style={styles.padContainer}>
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
          ['bio', '0', 'del'],
        ].map((row, ri) => (
          <View key={ri} style={styles.padRow}>
            {row.map((k) => {
              if (k === 'bio') {
                if (hasBiometrics) {
                  return (
                    <Pressable
                      key={k}
                      onPress={tryBiometrics}
                      style={({ pressed }) => [
                        styles.keyBtn,
                        styles.actionKey,
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                      accessibilityLabel="Biyometrik doğrulama"
                    >
                      <Fingerprint size={28} color={c.primary} strokeWidth={2.2} />
                    </Pressable>
                  );
                }
                return <View key={k} style={styles.keyBtn} />;
              }

              if (k === 'del') {
                return (
                  <Pressable
                    key={k}
                    onPress={deleteOne}
                    style={({ pressed }) => [
                      styles.keyBtn,
                      styles.actionKey,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                    accessibilityLabel="Sil"
                  >
                    <Delete size={26} color={c.textSecondary} strokeWidth={2} />
                  </Pressable>
                );
              }

              return (
                <Pressable
                  key={k}
                  onPress={() => press(k)}
                  style={({ pressed }) => [
                    styles.keyBtn,
                    {
                      backgroundColor: pressed ? c.primarySoft : c.surface,
                      borderColor: c.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={k}
                >
                  <Text style={[styles.keyText, { color: c.text }]}>{k}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingTop: 48,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 16,
  },
  lockIconBox: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  dots: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 28,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  padContainer: {
    paddingHorizontal: 36,
    gap: 16,
    marginBottom: 24,
  },
  padRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  keyBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionKey: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  keyText: {
    fontSize: 26,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});
