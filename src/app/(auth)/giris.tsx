import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Button, GoogleIcon, Header, Screen, TextField, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';

export default function Giris() {
  const { c, spacing, type } = useTheme();
  const { showToast } = useToast();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

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

  const handleGoogle = async () => {
    setGoogleBusy(true);
    setError(null);
    const err = await auth.signInWithGoogle();
    setGoogleBusy(false);
    if (err) {
      setError(err);
      showToast({ message: err, tone: 'warning' });
    }
  };

  return (
    <Screen keyboard>
      <Header title="Giriş Yap" back compact />
      <View style={{ marginTop: spacing.xxl }}>
        {auth.isGoogleConfigured ? (
          <>
            <Button
              label={googleBusy ? 'Giriş yapılıyor…' : 'Google ile devam et'}
              variant="secondary"
              icon={<GoogleIcon size={18} />}
              onPress={handleGoogle}
              disabled={busy || googleBusy}
              loading={googleBusy}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg }}>
              <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
              <Text style={[type.small, { color: c.textMuted, marginHorizontal: spacing.md }]}>veya e-posta ile</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
            </View>
          </>
        ) : null}

        <TextField label="E-posta" value={email} onChangeText={setEmail} placeholder="ornek@atolye.com" keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Şifre" value={pass} onChangeText={setPass} placeholder="••••••" secure error={error} />
        <Button label={busy ? 'Giriş yapılıyor…' : 'Giriş Yap'} onPress={submit} disabled={busy || googleBusy} />
        {busy ? <ActivityIndicator color={c.primary} style={{ marginTop: spacing.md }} /> : null}
        <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Link href="/(auth)/sifre-sifirla">
            <Text style={[type.small, { color: c.primary, fontWeight: '600' }]}>Şifremi unuttum</Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
