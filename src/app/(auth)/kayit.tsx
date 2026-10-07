import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Header, Screen, TextField } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';

export default function Kayit() {
  const { spacing, type, c } = useTheme();
  const auth = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) return setError('Adınızı girin.');
    if (!email.includes('@')) return setError('Geçerli bir e-posta girin.');
    if (pass.length < 6) return setError('Şifre en az 6 haneli olmalı.');
    setBusy(true);
    setError(null);
    const err = await auth.signUp(email.trim(), pass, name.trim());
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Screen keyboard>
      <Header title="Hesap Oluştur" back compact />
      <View style={{ marginTop: spacing.xl }}>
        <TextField label="Ad Soyad" value={name} onChangeText={setName} placeholder="Ayşe Yılmaz" />
        <TextField label="E-posta" value={email} onChangeText={setEmail} placeholder="ornek@atolye.com" keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Şifre" value={pass} onChangeText={setPass} placeholder="En az 6 hane" secure error={error} />
        <Button label={busy ? 'Hesap açılıyor…' : 'Devam Et'} onPress={submit} disabled={busy} />
        <Text style={[type.small, { color: c.textMuted, marginTop: spacing.md, textAlign: 'center' }]}>
          Sonraki adımda firmanızı kuracaksınız.
        </Text>
      </View>
    </Screen>
  );
}
