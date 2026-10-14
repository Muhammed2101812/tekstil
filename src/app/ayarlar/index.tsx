import React from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import {
  Building2,
  CalendarClock,
  CalendarDays,
  Scale,
  Users,
  ShieldCheck,
  Bell,
  Palette,
  UserCog,
  FileText,
} from 'lucide-react-native';
import { Avatar, Card, Header, ListRow, Screen } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useOrg } from '../../data/hooks';
import { useAuth } from '../../data/auth';

/** Ayarlar menüsü (PLAN 6.9) */
export default function Ayarlar() {
  const { c, type } = useTheme();
  const org = useOrg();
  const auth = useAuth();

  const groups: { title: string; items: { label: string; sub?: string; icon: React.ReactNode; href: string }[] }[] = [
    {
      title: 'FİRMA',
      items: [
        { label: 'Firma Bilgileri', icon: <Building2 size={20} color={c.primary} />, href: '/ayarlar/firma' },
        { label: 'Çalışma Saatleri', sub: 'Haftalık takvim, molalar', icon: <CalendarClock size={20} color={c.primary} />, href: '/ayarlar/calisma-saatleri' },
        { label: 'Tatiller & Özel Günler', sub: 'Resmî tatil, arife, firma tatili', icon: <CalendarDays size={20} color={c.primary} />, href: '/ayarlar/takvim' },
        { label: 'Hesaplama Kuralları', sub: 'Saatlik ücret, çarpanlar, kesintiler', icon: <Scale size={20} color={c.primary} />, href: '/ayarlar/kurallar' },
        { label: 'Departmanlar', icon: <Users size={20} color={c.primary} />, href: '/ayarlar/departmanlar' },
      ],
    },
    {
      title: 'UYGULAMA',
      items: [
        { label: 'Kullanıcılar', sub: 'Kullanıcı oluştur ve yönet', icon: <UserCog size={20} color={c.textSecondary} />, href: '/ayarlar/yoneticiler' },
        { label: 'Güvenlik', sub: 'Uygulama kilidi', icon: <ShieldCheck size={20} color={c.textSecondary} />, href: '/ayarlar/guvenlik' },
        { label: 'Bildirimler', icon: <Bell size={20} color={c.textSecondary} />, href: '/ayarlar/bildirimler' },
        { label: 'Görünüm', sub: 'Açık / koyu tema', icon: <Palette size={20} color={c.textSecondary} />, href: '/ayarlar/gorunum' },
      ],
    },
    {
      title: 'HESAP',
      items: [
        { label: 'Yedek & Hesap', sub: 'JSON yedek, geri yükleme, çıkış, silme', icon: <FileText size={20} color={c.danger} />, href: '/ayarlar/hesap' },
      ],
    },
  ];

  return (
    <Screen>
      <Header title="Ayarlar" back compact />
      <Card style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={org?.name ?? 'Firma'} size={56} photoUrl={org?.logo_url} />
          <View style={{ flex: 1 }}>
            <Text style={[type.subtitle, { color: c.text }]}>{org?.name ?? 'Firma'}</Text>
            <Text style={[type.small, { color: c.textMuted }]}>{auth.email ?? ''}</Text>
          </View></View>
      </Card>

      {groups.map((g) => (
        <View key={g.title} style={{ marginTop: 20 }}>
          <Text style={[type.label, { color: c.textMuted, marginBottom: 8 }]}>
            {g.title}
          </Text>
          <Card padded={false}>
            <View style={{ paddingVertical: 4 }}>
              {g.items.map((it, i) => (
                <View key={it.label} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.border }}>
                  <Link href={it.href as never} asChild>
                    <ListRow title={it.label} subtitle={it.sub} leading={<View style={{ width: 40, alignItems: 'center' }}>{it.icon}</View>} />
                  </Link>
                </View>
              ))}
            </View>
          </Card>
        </View>
      ))}
      <View style={{ height: 30 }} />
    </Screen>
  );
}
