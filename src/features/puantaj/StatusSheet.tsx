import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet, Button, ConfirmSheet, TimeSheet , STATUS_META , useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { AttendanceRecord, AttendanceStatus, ATTENDANCE_STATUSES } from '../../types';
import { markAttendance, addOvertime, clearAttendance } from '../../data/repo';
import { minutesToTime } from '../../domain/schedule';
import { hapticSuccess } from '../../utils/haptics';

/**
 * Kişiye dokununca açılan büyük renkli durum kutuları (PLAN 6.4).
 * Seçim anında kaydedilir; geç kalma/erken çıkış için saat alt sayfası açılır.
 */
export function StatusSheet({
  visible,
  onClose,
  employee,
  day,
  record,
  planStartMinutes,
  planEndMinutes,
  payrollLocked,
  /** Ek çalışma gününde "Geldi" seçilince otomatik mesai yazılır (PLAN 4.5) */
  autoOvertime,
}: {
  visible: boolean;
  onClose: () => void;
  employee: { id: string; full_name: string };
  day: string;
  record: AttendanceRecord | undefined;
  planStartMinutes: number | null;
  planEndMinutes: number | null;
  payrollLocked: boolean;
  autoOvertime?: { eventId: string; hours: number; multiplier: number; kind: 'hafta_sonu' | 'resmi_tatil' } | null;
}) {
  const { c, spacing, radius, type } = useTheme();
  const { showToast } = useToast();
  const [timeSheet, setTimeSheet] = useState<null | { mode: 'gec' | 'erken' }>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const t = useTheme();

  const apply = async (status: AttendanceStatus, extra?: Partial<AttendanceRecord>) => {
    if (payrollLocked) return;
    try {
      await markAttendance(day, [{ employee_id: employee.id, status, ...extra }]);
      if (autoOvertime && (status === 'geldi' || status === 'gec_geldi')) {
        await addOvertime({
          employee_id: employee.id,
          day,
          hours: autoOvertime.hours,
          kind: autoOvertime.kind,
          multiplier: autoOvertime.multiplier,
          calendar_event_id: autoOvertime.eventId,
        });
        showToast({
          message: `${employee.full_name}: ${autoOvertime.hours} saat × ${autoOvertime.multiplier.toString().replace('.', ',')} mesai yazıldı`,
          tone: 'success',
        });
      }
      hapticSuccess();
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Yoklama kaydedilemedi', tone: 'warning' });
    } finally {
      onClose();
    }
  };

  const baseMinutes = planStartMinutes ?? 480;
  const defaultLate = minutesToTime(baseMinutes + 15);
  const defaultEarly = minutesToTime(planEndMinutes ?? 1080);

  const mainStatuses: AttendanceStatus[] = ['geldi', 'gelmedi', 'gec_geldi', 'erken_cikti'];
  const otherStatuses: AttendanceStatus[] = ['yarim_gun', 'yillik_izin', 'mazeret_izni', 'ucretsiz_izin', 'rapor'];

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title={employee.full_name}>
        {payrollLocked ? (
          <Text style={[type.body, { color: c.danger, paddingBottom: spacing.lg }]}>
            Bu ay bordro kesinleşmiş; puantaj kilitli. Değiştirmek için bordroyu geri alın.
          </Text>
        ) : null}

        <View style={[styles.grid, { gap: 10 }]}>
          {mainStatuses.map((s) => {
            const meta = STATUS_META[s];
            const Icon = meta.icon;
            const { main, soft } = t.statusColor(s);
            const selected = record?.status === s;
            return (
              <Pressable
                key={s}
                disabled={payrollLocked}
                onPress={async () => {
                  if (s === 'gec_geldi') {
                    setTimeSheet({ mode: 'gec' });
                    return;
                  }
                  if (s === 'erken_cikti') {
                    setTimeSheet({ mode: 'erken' });
                    return;
                  }
                  await apply(s, s === 'geldi' ? { late_minutes: 0, arrival_time: null } : undefined);
                }}
                style={({ pressed }) => [
                  styles.box,
                  { backgroundColor: soft, borderRadius: radius.card, borderColor: selected ? main : 'transparent', opacity: pressed ? 0.85 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={meta.label}
              >
                <Icon size={26} color={main} />
                <Text style={[type.small, { color: main, fontWeight: '700', marginTop: 8, textAlign: 'center' }]}>
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[type.label, { color: c.textMuted, marginTop: spacing.lg, marginBottom: 8 }]}>DİĞER</Text>
        <View style={[styles.grid, { gap: 8 }]}>
          {otherStatuses.map((s) => {
            const meta = STATUS_META[s];
            const Icon = meta.icon;
            const { main, soft } = t.statusColor(s);
            const selected = record?.status === s;
            return (
              <Pressable
                key={s}
                disabled={payrollLocked}
                onPress={() => apply(s)}
                style={({ pressed }) => [
                  styles.smallBox,
                  { backgroundColor: soft, borderRadius: radius.md, borderColor: selected ? main : 'transparent', opacity: pressed ? 0.85 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={meta.label}
              >
                <Icon size={18} color={main} />
                <Text style={[type.label, { color: main, textAlign: 'center' }]}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.lg, marginBottom: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Mesai Ekle"
              variant="secondary"
              size="md"
              onPress={async () => {
                try {
                  await addOvertime({ employee_id: employee.id, day, hours: 1, kind: 'hafta_ici' });
                  showToast({ message: `${employee.full_name}: 1 saat mesai eklendi`, tone: 'success' });
                } catch (e) {
                  showToast({ message: e instanceof Error ? e.message : 'Mesai eklenemedi', tone: 'warning' });
                } finally {
                  onClose();
                }
              }}
            />
          </View>
          {record ? (
            <View style={{ flex: 1 }}>
              <Button
                label="Kaydı Sil"
                variant="ghost"
                size="md"
                onPress={() => setDeleteConfirm(true)}
              />
            </View>
          ) : null}
        </View>
      </BottomSheet>

      <ConfirmSheet
        visible={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title="Yoklama Kaydını Sil"
        message={`${employee.full_name} — ${day} kaydı silinecek ve "Geldi" sayılacak. Devam edilsin mi?`}
        confirmLabel="Sil"
        destructive
        onConfirm={async () => {
          try {
            await clearAttendance(day, employee.id);
            showToast({ message: 'Kayıt silindi, "Geldi" sayılacak', tone: 'success' });
          } catch (e) {
            showToast({ message: e instanceof Error ? e.message : 'Kayıt silinemedi', tone: 'warning' });
          } finally {
            onClose();
          }
        }}
      />

      <TimeSheet
        visible={timeSheet !== null}
        onClose={() => setTimeSheet(null)}
        title={timeSheet?.mode === 'gec' ? 'Geliş Saati' : 'Çıkış Saati'}
        value={timeSheet?.mode === 'gec' ? record?.arrival_time ?? defaultLate : record?.leave_time ?? defaultEarly}
        baseMinutes={timeSheet?.mode === 'gec' ? baseMinutes : undefined}
        onDone={async (time) => {
          if (timeSheet?.mode === 'gec') {
            const [h, m] = time.split(':').map(Number);
            await apply('gec_geldi', { arrival_time: time, late_minutes: Math.max(0, h * 60 + m - baseMinutes) });
          } else {
            const [h, m] = time.split(':').map(Number);
            const endMins = planEndMinutes ?? 1080;
            await apply('erken_cikti', { leave_time: time, early_leave_minutes: Math.max(0, endMins - (h * 60 + m)) });
          }
        }}
      />
    </>
  );
}

/** Çoklu seçim toplu işlemi ("Seçilenleri: İzinli yap", PLAN 6.4) */
export function BulkStatusSheet({
  visible,
  onClose,
  employeeIds,
  day,
}: {
  visible: boolean;
  onClose: () => void;
  employeeIds: string[];
  day: string;
}) {
  const { c, spacing, radius, type } = useTheme();
  const t = useTheme();
  const { showToast } = useToast();
  const [picked, setPicked] = useState<AttendanceStatus | null>(null);

  const statuses: AttendanceStatus[] = ATTENDANCE_STATUSES.filter((s) => s !== 'geldi');

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`${employeeIds.length} kişi için uygula`}>
      <View style={[styles.grid, { gap: 8 }]}>
        {statuses.map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          const { main, soft } = t.statusColor(s);
          return (
            <Pressable
              key={s}
              onPress={() => setPicked(s)}
              style={[styles.smallBox, { backgroundColor: soft, borderRadius: radius.md, borderColor: picked === s ? main : 'transparent' }]}
              accessibilityRole="button"
              accessibilityLabel={meta.label}
            >
              <Icon size={18} color={main} />
              <Text style={[type.label, { color: main, textAlign: 'center' }]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>
        <Button
          label="Uygula"
          disabled={!picked}
          onPress={async () => {
            if (!picked) return;
            try {
              await markAttendance(
                day,
                employeeIds.map((id) => ({ employee_id: id, status: picked }))
              );
              hapticSuccess();
              showToast({ message: `${employeeIds.length} kişi güncellendi`, tone: 'success' });
            } catch (e) {
              showToast({ message: e instanceof Error ? e.message : 'Toplu işlem başarısız', tone: 'warning' });
            } finally {
              setPicked(null);
              onClose();
            }
          }}
        />
      </View>
      <Text style={[type.small, { color: c.textMuted, paddingBottom: spacing.md }]}>
        “Geldi” hariç durumlar uygulanabilir; tek tek düzeltmek için kişiye dokunun.
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  box: { width: '48%', paddingVertical: 20, alignItems: 'center', borderWidth: 2 },
  smallBox: { width: '31%', paddingVertical: 12, alignItems: 'center', gap: 6, borderWidth: 2 },
});
