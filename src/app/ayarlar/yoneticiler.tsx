import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Copy, Trash2, UserPlus } from 'lucide-react-native';
import { ActionSheet, Badge, Button, Card, Header, Screen, SectionHeader, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';
import { useDataStore } from '../../data/store';
import { createInviteCode } from '../../data/repo';
import * as Clipboard from 'expo-clipboard';
import { isSupabaseConfigured } from '../../data/supabase';

/** Yöneticiler (PLAN 6.9): 6 haneli davet kodu, üye listesi */
export default function AyarYoneticiler() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const auth = useAuth();
  const members = useDataStore((s) => s.db.org_members);
  const orgId = useDataStore((s) => s.orgId);
  const remove = useDataStore((s) => s.remove);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  const myMembers = members.filter((m) => m.org_id === orgId);

  const generate = async () => {
    setBusy(true);
    try {
      const yeni = await createInviteCode();
      setCode(yeni);
      showToast({ message: `Davet kodu: ${yeni}`, tone: 'success' });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Kod oluşturulamadı', tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Yöneticiler" back compact />
      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={[type.body, { color: c.text, marginBottom: 8 }]}>Yönetici Davet Et</Text>
          <Text style={[type.small, { color: c.textMuted, marginBottom: 12 }]}>
            {isSupabaseConfigured
              ? 'Kod 7 gün geçerli. Karşı taraf uygulamaya kayıt olup "Davet kodum var" ile katılır.'
              : 'Cihaz modunda kod yalnız bu cihazda geçerlidir; bulut senkronu için Supabase kurun.'}
          </Text>
          {code ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={[type.money, { color: c.primary, letterSpacing: 4 }]}>{code}</Text>
              <Button
                label="Kopyala"
                variant="secondary"
                size="md"
                full={false}
                icon={<Copy size={16} color={c.text} />}
                onPress={() => {
                  Clipboard.setStringAsync(code).catch(() => undefined);
                  showToast({ message: 'Kod kopyalandı', tone: 'success' });
                }}
              />
            </View>
          ) : null}
          <Button label="Davet Kodu Oluştur" icon={<UserPlus size={18} color={c.onPrimary} />} onPress={generate} loading={busy} />
        </Card>

        <SectionHeader title={`YÖNETİCİLER (${myMembers.length})`} />
        <View style={{ gap: 10 }}>
          {myMembers.map((m) => (
            <Card key={m.id} onPress={() => m.user_id !== auth.userId && setMenuId(m.id)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[type.body, { color: c.text }]}>
                  {m.user_id === auth.userId ? `${auth.name ?? 'Siz'} (siz)` : 'Yönetici'}
                </Text>
                <Badge label={m.role === 'owner' ? 'Firma Sahibi' : 'Yönetici'} tone={m.role === 'owner' ? 'primary' : 'neutral'} />
              </View>
            </Card>
          ))}
        </View>
        <View style={{ height: 30 }} />
      </View>

      <ActionSheet
        visible={!!menuId}
        onClose={() => setMenuId(null)}
        actions={[
          {
            label: 'Yöneticiyi Çıkar',
            icon: <Trash2 size={20} color={c.danger} />,
            destructive: true,
            onPress: () => {
              if (menuId) {
                remove('org_members', [menuId]);
                showToast({ message: 'Yönetici çıkarıldı', tone: 'success' });
              }
            },
          },
        ]}
      />
    </Screen>
  );
}
