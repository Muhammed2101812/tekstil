import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { KeyRound, Trash2, UserPlus } from 'lucide-react-native';
import { ActionSheet, Badge, Button, Card, Header, Screen, SectionHeader, SegmentedControl, TextField, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';
import { useDataStore } from '../../data/store';
import { removeMember } from '../../data/repo';
import type { OrgMember, Role } from '../../types';

/** Kullanıcılar (PLAN 6.9): firma sahibi kullanıcı oluşturur, şifre sıfırlar, çıkarır */
export default function AyarYoneticiler() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const auth = useAuth();
  const members = useDataStore((s) => s.db.org_members);
  const orgId = useDataStore((s) => s.orgId);

  const myMembers = useMemo(() => members.filter((m) => m.org_id === orgId), [members, orgId]);
  const myRole: Role | null = useMemo(() => {
    const m = myMembers.find((x) => x.user_id === auth.userId);
    return m?.role ?? null;
  }, [myMembers, auth.userId]);
  const isOwner = myRole === 'owner';

  // Oluşturma formu
  const [name, setName] = useState('');
  const [mail, setMail] = useState('');
  const [pass, setPass] = useState('');
  const [role, setRole] = useState<Role>('admin');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Üye aksiyonları
  const [menuId, setMenuId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<OrgMember | null>(null);
  const [newPass, setNewPass] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const menuMember = myMembers.find((m) => m.id === menuId) ?? null;

  const submit = async () => {
    setFormError(null);
    if (name.trim().length < 2) return setFormError('Ad en az 2 karakter olmalı.');
    if (!mail.trim().includes('@')) return setFormError('Geçerli bir e-posta girin.');
    if (pass.length < 6) return setFormError('Şifre en az 6 karakter olmalı.');
    setBusy(true);
    const err = await auth.createManagedUser(name.trim(), mail.trim(), pass, role);
    setBusy(false);
    if (err) {
      setFormError(err);
      return;
    }
    setName('');
    setMail('');
    setPass('');
    setRole('admin');
    showToast({ message: 'Kullanıcı oluşturuldu', tone: 'success' });
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    setResetError(null);
    if (newPass.length < 6) return setResetError('Şifre en az 6 karakter olmalı.');
    setResetBusy(true);
    const err = await auth.resetManagedUserPassword(resetTarget.user_id, newPass);
    setResetBusy(false);
    if (err) {
      setResetError(err);
      return;
    }
    setResetTarget(null);
    setNewPass('');
    showToast({ message: 'Şifre güncellendi, kullanıcının oturumları kapatıldı', tone: 'success' });
  };

  return (
    <Screen keyboard>
      <Header title="Kullanıcılar" back compact />
      <View style={{ marginTop: 12 }}>
        {isOwner ? (
          <Card>
            <Text style={[type.body, { color: c.text, marginBottom: 4 }]}>Kullanıcı Ekle</Text>
            <Text style={[type.small, { color: c.textMuted, marginBottom: 12 }]}>
              Kullanıcı e-posta ve şifreyle giriş yapar. Şifreyi siz belirlersiniz; sonra değiştirebilirsiniz.
            </Text>
            <TextField label="Ad Soyad" value={name} onChangeText={setName} placeholder="Örn. Ayşe Yılmaz" />
            <TextField
              label="E-posta"
              value={mail}
              onChangeText={setMail}
              placeholder="kullanici@atolye.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextField label="Şifre" value={pass} onChangeText={setPass} placeholder="En az 6 karakter" secure error={formError} />
            <Text style={[type.small, { color: c.textSecondary, fontWeight: '600', marginVertical: 8 }]}>Rol</Text>
            <SegmentedControl<Role>
              options={[
                { value: 'admin', label: 'Yönetici' },
                { value: 'owner', label: 'Firma Sahibi' },
              ]}
              value={role}
              onChange={setRole}
            />
            <View style={{ marginTop: 14 }}>
              <Button
                label={busy ? 'Oluşturuluyor…' : 'Kullanıcı Oluştur'}
                icon={<UserPlus size={18} color={c.onPrimary} />}
                onPress={submit}
                loading={busy}
                disabled={busy}
              />
            </View>
          </Card>
        ) : (
          <Card>
            <Text style={[type.small, { color: c.textMuted, textAlign: 'center' }]}>
              Kullanıcı eklemek, şifre sıfırlamak ve çıkarmak için Firma Sahibi yetkisi gerekir.
            </Text>
          </Card>
        )}

        {resetTarget ? (
          <Card>
            <Text style={[type.body, { color: c.text, marginBottom: 4 }]}>
              Şifre Sıfırla — {resetTarget.name ?? resetTarget.email ?? 'Kullanıcı'}
            </Text>
            <Text style={[type.small, { color: c.textMuted, marginBottom: 12 }]}>
              Yeni şifreyi kullanıcıya iletin; tüm oturumları kapatılır.
            </Text>
            <TextField
              label="Yeni Şifre"
              value={newPass}
              onChangeText={setNewPass}
              placeholder="En az 6 karakter"
              secure
              error={resetError}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Button label={resetBusy ? 'Kaydediliyor…' : 'Kaydet'} onPress={submitReset} loading={resetBusy} disabled={resetBusy} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="İptal"
                  variant="secondary"
                  onPress={() => {
                    setResetTarget(null);
                    setNewPass('');
                    setResetError(null);
                  }}
                  disabled={resetBusy}
                />
              </View>
            </View>
          </Card>
        ) : null}

        <SectionHeader title={`KULLANICILAR (${myMembers.length})`} />
        <View style={{ gap: 10 }}>
          {myMembers.map((m) => (
            <Card key={m.id} onPress={() => isOwner && m.user_id !== auth.userId && setMenuId(m.id)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[type.body, { color: c.text }]} numberOfLines={1}>
                    {m.user_id === auth.userId ? `${m.name ?? auth.name ?? 'Siz'} (siz)` : m.name ?? 'Yönetici'}
                  </Text>
                  {m.email ? (
                    <Text style={[type.small, { color: c.textMuted, marginTop: 2 }]} numberOfLines={1}>
                      {m.email}
                    </Text>
                  ) : null}
                </View>
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
            label: 'Şifreyi Sıfırla',
            icon: <KeyRound size={20} color={c.textSecondary} />,
            onPress: () => {
              if (menuMember) {
                setResetTarget(menuMember);
                setNewPass('');
                setResetError(null);
              }
            },
          },
          {
            label: 'Şirketten Çıkar',
            icon: <Trash2 size={20} color={c.danger} />,
            destructive: true,
            onPress: async () => {
              if (!menuMember || !auth.userId) return;
              try {
                await removeMember(menuMember.id, auth.userId);
                showToast({ message: 'Kullanıcı şirketten çıkarıldı', tone: 'success' });
              } catch (e) {
                showToast({ message: e instanceof Error ? e.message : 'Çıkarılamadı', tone: 'warning' });
              }
            },
          },
        ]}
      />
    </Screen>
  );
}
