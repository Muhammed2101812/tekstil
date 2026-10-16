import React, { useEffect } from 'react';
import {
  BackHandler,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrowUpCircle, ExternalLink } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import {
  AppVersionConfig,
  getCurrentVersionCode,
  openStore,
} from '../domain/version-gate';

interface UpdateGateModalProps {
  visible: boolean;
  config: AppVersionConfig | null;
}

export function UpdateGateModal({ visible, config }: UpdateGateModalProps) {
  const { c, type, radius } = useTheme();

  // Android geri tuşunu kilitler — modal aşılamaz
  useEffect(() => {
    if (!visible) return;
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => backSub.remove();
  }, [visible]);

  if (!visible || !config) return null;

  const currentCode = getCurrentVersionCode();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Kapatılamaz
      }}
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(15, 23, 42, 0.82)' }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: c.surface,
              borderRadius: radius.card,
              borderColor: c.border,
            },
          ]}
        >
          {/* İkon */}
          <View style={[styles.iconBox, { backgroundColor: c.primarySoft }]}>
            <ArrowUpCircle size={40} color={c.primary} strokeWidth={2.2} />
          </View>

          {/* Başlık ve Açıklama */}
          <Text style={[type.title, { color: c.text, textAlign: 'center', marginTop: 18 }]}>
            {config.title}
          </Text>

          <Text
            style={[
              type.body,
              {
                color: c.textSecondary,
                textAlign: 'center',
                marginTop: 10,
                lineHeight: 22,
              },
            ]}
          >
            {config.message}
          </Text>

          {/* Sürüm Bilgi Rozeti */}
          <View style={[styles.versionBadge, { backgroundColor: c.surfaceSubtle }]}>
            <Text style={[type.small, { color: c.textMuted }]}>
              Mevcut: v{currentCode} · Gereken: v{config.min_version_code}+
            </Text>
          </View>

          {/* Güncelle Butonu */}
          <View style={{ width: '100%', marginTop: 24 }}>
            <Button
              label="Google Play'den Güncelle"
              icon={<ExternalLink size={18} color="#FFFFFF" />}
              onPress={() => openStore(config.store_url)}
              full
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  iconBox: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 14,
  },
});
