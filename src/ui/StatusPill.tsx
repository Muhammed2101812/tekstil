import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, Clock, X, AlertCircle, MinusCircle, Sun, Heart, PauseCircle, Stethoscope } from 'lucide-react-native';
import { AttendanceStatus } from '../types';
import { useTheme } from '../theme/ThemeProvider';

export const STATUS_META: Record<AttendanceStatus, { label: string; icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  geldi: { label: 'Geldi', icon: Check },
  gelmedi: { label: 'Gelmedi', icon: X },
  gec_geldi: { label: 'Geç Geldi', icon: Clock },
  erken_cikti: { label: 'Erken Çıktı', icon: AlertCircle },
  yarim_gun: { label: 'Yarım Gün', icon: MinusCircle },
  yillik_izin: { label: 'Yıllık İzin', icon: Sun },
  mazeret_izni: { label: 'Mazeret İzni', icon: Heart },
  ucretsiz_izin: { label: 'Ücretsiz İzin', icon: PauseCircle },
  rapor: { label: 'Raporlu', icon: Stethoscope },
};

/** Puantaj durumu etiketi — renk + ikon + yazı birlikte (PLAN 2.8) */
export function StatusPill({ status, detail, size = 'md' }: { status: AttendanceStatus; detail?: string; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const { main, soft } = t.statusColor(status);
  const Icon = STATUS_META[status].icon;
  const pad = size === 'sm' ? { px: 8, py: 3, icon: 13, font: 12 } : { px: 12, py: 6, icon: 15, font: 13 };
  return (
    <View style={[styles.base, { backgroundColor: soft, borderRadius: t.radius.pill, paddingHorizontal: pad.px, paddingVertical: pad.py }]}>
      <Icon size={pad.icon} color={main} />
      <Text style={{ color: main, fontSize: pad.font, fontWeight: '700', marginLeft: 5 }}>
        {STATUS_META[status].label}
        {detail ? ` · ${detail}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
});
