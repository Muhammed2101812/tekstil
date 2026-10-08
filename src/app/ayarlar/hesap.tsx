import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { DatabaseBackup, FileUp, History, LogOut, Trash2 } from 'lucide-react-native';
import { Button, Card, ConfirmSheet, Header, Screen, SectionHeader, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';
import { useDataStore } from '../../data/store';
import { useSyncStatus } from '../../data/hooks';
import { deleteAccountEverywhere } from '../../data/repo';
import { isSupabaseConfigured } from '../../data/supabase';
import { File } from 'expo-file-system';
import { listSnapshots, restoreSnapshot, takeSnapshot, SnapshotItem } from '../../data/snapshot';

/** Yedek & Hesap (PLAN 6.9, 8): JSON yedek/geri yükleme, yerel anlık görüntüler, çıkış, hesap silme */
export default function AyarHesap() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const auth = useAuth();
  const db = useDataStore((s) => s.db);
  const { pending } = useSyncStatus();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [snapshotRestoreOpen, setSnapshotRestoreOpen] = useState(false);
  const [takingSnapshot, setTakingSnapshot] = useState(false);

  const loadSnapshots = useCallback(async () => {
    try {
      const list = await listSnapshots();
      setSnapshots(list);
    } catch {
      // sessizce geç
    }
  }, []);

  useEffect(() => {
    let active = true;
    listSnapshots()
      .then((list) => {
        if (active) setSnapshots(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const handleTakeManualSnapshot = async () => {
    setTakingSnapshot(true);
    try {
      await takeSnapshot('manual');
      await loadSnapshots();
      showToast({ message: 'Yerel anlık görüntü alındı', tone: 'success' });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Anlık görüntü alınamadı', tone: 'warning' });
    } finally {
      setTakingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async () => {
    if (!selectedSnapshot) return;
    try {
      const res = await restoreSnapshot(selectedSnapshot);
      if (res.ok) {
        showToast({ message: 'Anlık görüntü geri yüklendi', tone: 'success' });
        await loadSnapshots();
      } else {
        showToast({ message: res.error ?? 'Geri yükleme başarısız', tone: 'warning' });
      }
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Geri yükleme hatası', tone: 'warning' });
    } finally {
      setSelectedSnapshot(null);
    }
  };

  const backupJson = async () => {
    try {
      const m = await import('../../export/excel');
      await m.shareFullBackupJson(db);
      showToast({ message: 'JSON yedeği hazır — güvenli bir yerde saklayın', tone: 'success' });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Yedek alınamadı', tone: 'warning' });
    }
  };

  const backupExcel = async () => {
    try {
      const m = await import('../../export/excel');
      await m.shareFullBackupExcel(db);
      showToast({ message: 'Excel yedeği hazır', tone: 'success' });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Excel yedeği alınamadı', tone: 'warning' });
    }
  };

  const pickAndRestore = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      // Geri yükleme öncesi güvenlik anlık görüntüsü
      await takeSnapshot('pre-file-restore');
      const file = new File(res.assets[0].uri);
      const text = file.text();
      const m = await import('../../export/excel');
      const result = await m.restoreFromJsonText(await text);
      if (result.ok) {
        showToast({ message: 'Yedek geri yüklendi', tone: 'success' });
        await loadSnapshots();
      } else {
        showToast({ message: result.error ?? 'Geri yükleme başarısız', tone: 'warning' });
      }
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Dosya okunamadı', tone: 'warning' });
    }
  };

  return (
    <Screen>
      <Header title="Yedek & Hesap" back compact />
      <View style={{ marginTop: 12 }}>
        <SectionHeader title="YEDEK" />
        <Card>
          <Text style={[type.small, { color: c.textMuted, marginBottom: 12 }]}>
            {isSupabaseConfigured
              ? 'Veriler bulutta da tutuluyor; yine de düzenli yedek alın (ücretsiz katmanda otomatik yedek yok).'
              : 'Cihaz modundasınız: veriler yalnız bu telefonda. Düzenli JSON yedeği alıp güvenli bir yerde saklayın.'}
          </Text>
          <View style={{ gap: 10 }}>
            <Button label="JSON Yedeği Al (geri yüklenebilir)" icon={<DatabaseBackup size={18} color={c.onPrimary} />} onPress={backupJson} />
            <Button label="Excel Yedeği Al (okunabilir)" variant="secondary" onPress={backupExcel} />
          </View>
        </Card>

        <SectionHeader title="GERİ YÜKLEME" />
        <Card>
          <Text style={[type.small, { color: c.textMuted, marginBottom: 12 }]}>
            JSON yedeği seçin. Mevcut tüm veri yedek içeriğiyle değiştirilir — önce yedek alın.
          </Text>
          <Button
            label="Yedekten Geri Yükle"
            variant="secondary"
            icon={<FileUp size={18} color={c.text} />}
            onPress={() => setRestoreOpen(true)}
          />
        </Card>

        <SectionHeader title="OTOMATİK YEREL YEDEKLER" />
        <Card>
          <Text style={[type.small, { color: c.textMuted, marginBottom: 12 }]}>
            Uygulama açılışında, güncelleme sonrasında ve geri yükleme öncesinde otomatik yerel anlık görüntüler alınır. Son 7 anlık görüntü saklanır.
          </Text>
          {snapshots.length === 0 ? (
            <Text style={[type.bodySm, { color: c.textSecondary, marginVertical: 8, textAlign: 'center' }]}>
              Henüz yerel anlık görüntü bulunmuyor.
            </Text>
          ) : (
            <View style={{ gap: 8, marginBottom: 12 }}>
              {snapshots.map((s) => (
                <View
                  key={s.filename}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: c.border,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[type.bodySm, { color: c.text, fontWeight: '600' }]}>
                      {s.filename.replace('snapshot-', '').replace('.json', '')}
                    </Text>
                    <Text style={[type.small, { color: c.textMuted }]}>
                      Boyut: {s.sizeFormatted}
                    </Text>
                  </View>
                  <Button
                    label="Geri Yükle"
                    size="sm"
                    variant="secondary"
                    full={false}
                    onPress={() => {
                      setSelectedSnapshot(s.filename);
                      setSnapshotRestoreOpen(true);
                    }}
                  />
                </View>
              ))}
            </View>
          )}
          <Button
            label={takingSnapshot ? 'Alınıyor…' : 'Şimdi Anlık Görüntü Al'}
            variant="secondary"
            icon={<History size={16} color={c.text} />}
            onPress={handleTakeManualSnapshot}
            disabled={takingSnapshot}
            loading={takingSnapshot}
          />
        </Card>

        <SectionHeader title="OTURUM" />
        <Card>
          <Button label="Çıkış Yap" variant="secondary" icon={<LogOut size={18} color={c.text} />} onPress={() => auth.signOut()} />
          <Text style={[type.small, { color: c.textMuted, marginTop: 10, textAlign: 'center' }]}>
            {auth.email ?? ''} · {pending} bekleyen senkron kaydı
          </Text>
        </Card>

        <SectionHeader title="HESAP SİLME" />
        <Card>
          <Text style={[type.small, { color: c.danger, marginBottom: 12 }]}>
            Hesabınız ve tüm firma veriniz kalıcı olarak silinir. Bu işlem geri alınamaz.
          </Text>
          <Button label="Hesabımı ve Verilerimi Sil" variant="danger" icon={<Trash2 size={18} color={c.onPrimary} />} onPress={() => setDeleteOpen(true)} />
        </Card>
        <View style={{ height: 30 }} />
      </View>

      <ConfirmSheet
        visible={snapshotRestoreOpen}
        onClose={() => {
          setSnapshotRestoreOpen(false);
          setSelectedSnapshot(null);
        }}
        title="Anlık Görüntüyü Geri Yükle"
        message={`Seçilen yerel anlık görüntü (${selectedSnapshot ?? ''}) geri yüklenecek. Mevcut verilerin bir kopyası işlemden önce güvenlik için saklanır. Devam edilsin mi?`}
        confirmLabel="Geri Yükle"
        destructive
        onConfirm={handleRestoreSnapshot}
      />

      <ConfirmSheet
        visible={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Yedeği Geri Yükle"
        message="Mevcut tüm veri yedek içeriğiyle değiştirilecek. Emin misiniz?"
        confirmLabel="Geri Yükle"
        destructive
        onConfirm={pickAndRestore}
      />

      <ConfirmSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Hesabı Sil"
        message="Firma, personel, puantaj, borç ve bordro kayıtlarının tamamı silinir. Bu işlem geri alınamaz."
        confirmLabel="Kalıcı Olarak Sil"
        destructive
        holdToConfirm
        onConfirm={async () => {
          try {
            await deleteAccountEverywhere();
            showToast({ message: 'Hesap silindi', tone: 'success' });
          } catch (e) {
            showToast({ message: e instanceof Error ? e.message : 'Silme başarısız', tone: 'warning' });
          }
        }}
      />
    </Screen>
  );
}
