import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { ActionSheet, Badge, Button, Card, ConfirmSheet, Header, Screen, TextField, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useDataStore } from '../../data/store';
import { useDepartments, useEmployees } from '../../data/hooks';
import { addDepartment, removeDepartment } from '../../data/repo';
import { AVATAR_RENKLER as RENKLER } from '../../utils/format';

/** Departmanlar (PLAN 6.9): renk seçimi ve sıralama */
export default function AyarDepartmanlar() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const departments = useDepartments();
  const employees = useEmployees();
  const allEvents = useDataStore((s) => s.db.calendar_events);
  const allScheduleDays = useDataStore((s) => s.db.schedule_days);
  const [name, setName] = useState('');
  const [color, setColor] = useState(RENKLER[0]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteTarget = departments.find((d) => d.id === deleteId) ?? null;
  const deleteInfo = deleteTarget
    ? {
        employees: employees.filter((e) => e.department_id === deleteTarget.id).length,
        events: allEvents.filter((e) => e.department_id === deleteTarget.id).length,
        scheduleDays: allScheduleDays.filter((d) => d.department_id === deleteTarget.id).length,
      }
    : null;

  return (
    <Screen keyboard>
      <Header title="Departmanlar" back compact />
      <View style={{ marginTop: 12 }}>
        {departments.length === 0 ? (
          <Card style={{ marginBottom: 16 }}>
            <Text style={[type.body, { color: c.textSecondary, textAlign: 'center' }]}>
              Henüz departman yok. Kesim, Dikim, Ütü gibi bölümleri ekleyin.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 10, marginBottom: 20 }}>
            {departments.map((d) => (
              <Card key={d.id} onPress={() => setMenuId(d.id)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: d.color }} />
                    <Text style={[type.body, { color: c.text }]}>{d.name}</Text>
                  </View>
                  <Badge label={`${employees.filter((e) => e.department_id === d.id).length} kişi`} />
                </View>
              </Card>
            ))}
          </View>
        )}

        <TextField label="Yeni Departman" value={name} onChangeText={setName} placeholder="Örn. Kalite Kontrol" />
        <Text style={[type.small, { color: c.textSecondary, fontWeight: '600', marginVertical: 8 }]}>Renk</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          {RENKLER.map((r) => {
            const selected = color === r;
            return (
              <Pressable
                key={r}
                onPress={() => setColor(r)}
                hitSlop={6}
                style={[
                  styles.swatchOuter,
                  {
                    borderColor: selected ? c.text : 'transparent',
                    backgroundColor: selected ? c.surface : 'transparent',
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Renk ${r}`}
                accessibilityState={{ selected }}
              >
                <View style={[styles.swatch, { backgroundColor: r }]} />
              </Pressable>
            );
          })}
        </View>
        <Button
          label="Departman Ekle"
          icon={<Plus size={18} color={c.onPrimary} />}
          disabled={name.trim().length < 2}
          onPress={async () => {
            try {
              await addDepartment(name.trim(), color);
              setName('');
              showToast({ message: 'Departman eklendi', tone: 'success' });
            } catch (e) {
              showToast({ message: e instanceof Error ? e.message : 'Departman eklenemedi', tone: 'warning' });
            }
          }}
        />
        <View style={{ height: 20 }} />
      </View>

      <ActionSheet
        visible={!!menuId}
        onClose={() => setMenuId(null)}
        title={departments.find((d) => d.id === menuId)?.name}
        actions={[
          {
            label: 'Sil',
            icon: <Trash2 size={20} color={c.danger} />,
            destructive: true,
            onPress: () => {
              if (!menuId) return;
              setDeleteId(menuId);
              setMenuId(null);
            },
          },
        ]}
      />

      {/* Departmana bağlı takvim/olay kayıtları FK zinciriyle silineceği için sonuçlar onaylatılır */}
      <ConfirmSheet
        visible={!!deleteTarget}
        onClose={() => setDeleteId(null)}
        title="Departmanı Sil"
        message={
          deleteInfo && deleteTarget
            ? `"${deleteTarget.name}" silinecek. Bağlı ${deleteInfo.employees} çalışanın departmanı boşalır${
                deleteInfo.events + deleteInfo.scheduleDays > 0
                  ? `; departmana özel ${deleteInfo.events + deleteInfo.scheduleDays} takvim/olay kaydı da silinir.`
                  : '.'
              }`
            : ''
        }
        confirmLabel="Sil"
        destructive
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await removeDepartment(deleteId);
            showToast({ message: 'Departman silindi', tone: 'success' });
          } catch (e) {
            showToast({ message: e instanceof Error ? e.message : 'Departman silinemedi', tone: 'warning' });
          } finally {
            setDeleteId(null);
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  swatchOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
