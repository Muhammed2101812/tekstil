import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Button, Card, Header, Screen, SectionHeader, SegmentedControl, TextField, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemeStore } from '../../state/settings';

/** Güvenlik (PLAN 6.9): uygulama kilidi — parmak izi / yüz / PIN */
export default function AyarGuvenlik() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const enabled = useThemeStore((s) => s.appLockEnabled);
  const autoLock = useThemeStore((s) => s.autoLockMinutes);
  const setAppLock = useThemeStore((s) => s.setAppLock);
  const setAutoLockMinutes = useThemeStore((s) => s.setAutoLockMinutes);

  const [bioAvailable, setBioAvailable] = useState(false);
  const [step, setStep] = useState<'idle' | 'set'>('idle');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');

  useEffect(() => {
    (async () => {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBioAvailable(has && enrolled);
    })();
  }, []);

  const enable = () => {
    if (pin1.length !== 4 || pin1 !== pin2) {
      showToast({ message: 'PIN 4 hane ve iki giriş aynı olmalı', tone: 'warning' });
      return;
    }
    setAppLock(true, pin1);
    setStep('idle');
    setPin1('');
    setPin2('');
    showToast({ message: 'Uygulama kilidi açıldı', tone: 'success' });
  };

  return (
    <Screen>
      <Header title="Güvenlik" back compact />
      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={[type.body, { color: c.text, fontWeight: '700', marginBottom: 4 }]}>Uygulama Kilidi</Text>
          <Text style={[type.small, { color: c.textMuted, marginBottom: 12 }]}>
            Maaş verisi meraklı gözlerden korunur. Açılışta parmak izi/yüz doğrulaması istenir; olmazsa 4 haneli PIN.
          </Text>
          <SegmentedControl
            options={[
              { value: 'acik', label: 'Açık' },
              { value: 'kapali', label: 'Kapalı' },
            ]}
            value={enabled ? 'acik' : 'kapali'}
            onChange={(v) => {
              if (v === 'kapali') {
                setAppLock(false, null);
                showToast({ message: 'Kilit kapatıldı', tone: 'info' });
              } else {
                setStep('set');
              }
            }}
          />
          {bioAvailable ? (
            <Text style={[type.small, { color: c.success, marginTop: 10 }]}>
              Bu telefonda parmak izi / yüz tanıma kullanılabilir.
            </Text>
          ) : (
            <Text style={[type.small, { color: c.warning, marginTop: 10 }]}>
              Bu telefonda biyometrik kayıtlı değil; yalnız PIN ile korunur.
            </Text>
          )}
        </Card>

        {step === 'set' ? (
          <Card style={{ marginTop: 12 }}>
            <TextField
              label="Yeni PIN (4 hane)"
              value={pin1}
              onChangeText={(t) => setPin1(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              keyboardType="numeric"
              secure
            />
            <TextField
              label="PIN (tekrar)"
              value={pin2}
              onChangeText={(t) => setPin2(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              keyboardType="numeric"
              secure
            />
            <Button label="PIN'i Kaydet" onPress={enable} disabled={pin1.length !== 4 || pin2.length !== 4} />
          </Card>
        ) : null}

        {enabled ? (
          <>
            <SectionHeader title="OTOMATİK KİLİT" />
            <Card>
              <Text style={[type.small, { color: c.textMuted, marginBottom: 10 }]}>
                Uygulama arka plana geçince bu süre sonunda kilitlenir.
              </Text>
              <SegmentedControl
                options={[
                  { value: '1', label: '1 dk' },
                  { value: '3', label: '3 dk' },
                  { value: '5', label: '5 dk' },
                ]}
                value={String(Math.min(autoLock, 5))}
                onChange={(v) => setAutoLockMinutes(Number(v))}
              />
            </Card>
          </>
        ) : null}
        <View style={{ height: 30 }} />
      </View>
    </Screen>
  );
}
