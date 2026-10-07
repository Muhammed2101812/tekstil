import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Header, Screen, TextField } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';

export default function SifreSifirla() {
  const { spacing, type, c } = useTheme();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setError('Geçerli bir e-posta girin.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const err = await auth.resetPassword(trimmed);
      if (err) {
        setError(err);
      } else {
        setInfo(`Sıfırlama bağlantısı ${trimmed} adresine gönderildi.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sıfırlama işlemi başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard>
      <Header title="Şifremi Unuttum" back compact />
      <View style={{ marginTop: spacing.xxl }}>
        <TextField
          label="E-posta"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (error) setError(null);
          }}
          placeholder="ornek@atolye.com"
          keyboardType="email-address"
          autoCapitalize="none"
          error={error}
        />
        <Button label={busy ? 'Gönderiliyor…' : 'Sıfırlama Gönder'} onPress={submit} disabled={busy} />
        {info ? (
          <Text style={[type.small, { color: c.textSecondary, marginTop: spacing.lg, textAlign: 'center' }]}>{info}</Text>
        ) : null}
      </View>
    </Screen>
  );
}
