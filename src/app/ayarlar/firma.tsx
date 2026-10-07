import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Header, Screen, TextField, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useOrg } from '../../data/hooks';
import { updateOrgProfile } from '../../data/repo';

/** Firma bilgileri: ad (logo ileriki sürümde) */
export default function AyarFirma() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const org = useOrg();
  const [name, setName] = useState(org?.name ?? '');

  return (
    <Screen keyboard>
      <Header title="Firma Bilgileri" back compact />
      <View style={{ marginTop: 12 }}>
        <TextField label="Firma Adı" value={name} onChangeText={setName} placeholder="Yılmaz Tekstil" />
        <Card>
          <Text style={[type.small, { color: c.textMuted }]}>
            Bu ad maaş pusulalarında, puantaj cetvelinde ve raporlarda görünür. Logo ekleme ileriki sürümde.
          </Text>
        </Card>
        <Button
          label="Kaydet"
          disabled={name.trim().length < 2 || name === org?.name}
          onPress={() => {
            updateOrgProfile(name.trim(), org?.logo_url ?? null);
            showToast({ message: 'Firma adı güncellendi', tone: 'success' });
          }}
        />
      </View>
    </Screen>
  );
}
