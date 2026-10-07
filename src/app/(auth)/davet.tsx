import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Header, Screen, TextField } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';
import { joinByInviteCode } from '../../data/repo';

/** Davet koduyla firmaya yönetici olarak katılma (PLAN 5 org_invites) */
export default function Davet() {
  const { spacing, type, c } = useTheme();
  const auth = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Oturum yoksa önce giriş yapılmalı
  if (!auth.userId) {
    return (
      <Screen>
        <Header title="Davet ile Katıl" back compact />
        <View style={{ marginTop: spacing.xxl, gap: spacing.lg }}>
          <Text style={[type.body, { color: c.textSecondary, textAlign: 'center' }]}>
            Davet kodunuzu kullanmak için önce giriş yapın veya hesap açın.
          </Text>
          <Button label="Giriş / Kayıt" onPress={() => router.replace('/(auth)/hosgeldin')} />
        </View>
      </Screen>
    );
  }

  const submit = async () => {
    if (code.trim().length !== 6) return setError('Kod 6 haneli olmalı.');
    setBusy(true);
    setError(null);
    try {
      await joinByInviteCode(code.trim());
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Katılım başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard>
      <Header title="Davet ile Katıl" back compact />
      <View style={{ marginTop: spacing.xxl }}>
        <TextField
          label="Davet Kodu"
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          keyboardType="numeric"
          error={error}
          hint="Kodu, firma sahibinden (Ayarlar → Yöneticiler) alın."
        />
        <Button label={busy ? 'Katılıyor…' : 'Firmaya Katıl'} onPress={submit} disabled={busy} />
      </View>
    </Screen>
  );
}
