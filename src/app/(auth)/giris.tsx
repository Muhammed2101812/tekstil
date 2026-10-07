import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Button, Header, Screen, TextField } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';

export default function Giris() {
  const { c, spacing, type } = useTheme();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.includes('@') || pass.length < 6) {
      setError('E-posta ve en az 6 haneli şifre girin.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await auth.signIn(email.trim(), pass);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Screen keyboard>
      <Header title="Giriş Yap" back compact />
      <View style={{ marginTop: spacing.xxl }}>
        <TextField label="E-posta" value={email} onChangeText={setEmail} placeholder="ornek@atolye.com" keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Şifre" value={pass} onChangeText={setPass} placeholder="••••••" secure error={error} />
        <Button label={busy ? 'Giriş yapılıyor…' : 'Giriş Yap'} onPress={submit} disabled={busy} />
        {busy ? <ActivityIndicator color={c.primary} style={{ marginTop: spacing.md }} /> : null}
        <View style={{ marginTop: spacing.lg, alignItems: 'center', gap: spacing.md }}>
          <Link href="/(auth)/sifre-sifirla">
            <Text style={[type.small, { color: c.primary, fontWeight: '600' }]}>Şifremi unuttum</Text>
          </Link>
          <Link href="/(auth)/davet">
            <Text style={[type.small, { color: c.textMuted }]}>Davet kodum var</Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
