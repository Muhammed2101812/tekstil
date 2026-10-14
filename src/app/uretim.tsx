import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check, Layers, Search, Trash2 } from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  DateField,
  EmptyState,
  Header,
  Screen,
  SegmentedControl,
  TextField,
  useToast,
} from '../ui';
import { useTheme } from '../theme/ThemeProvider';
import { useProductionBatches } from '../data/hooks';
import { addProductionBatch, deleteProductionBatch } from '../data/repo';
import {
  LABEL_COLORS,
  LABEL_COLOR_MAP,
  getRecentModelNames,
  groupBatchesByModel,
} from '../domain/production';
import { LabelColor, ProductionBatch } from '../types';
import { todayISO } from '../domain/schedule';
import { formatTarihKisa } from '../utils/format';
import { hapticLight, hapticSuccess, hapticWarning } from '../utils/haptics';

export default function UretimScreen() {
  const { c, type, radius } = useTheme();
  const { showToast } = useToast();
  const batches = useProductionBatches();

  const [tab, setTab] = useState<'gir' | 'liste'>('gir');

  // Form State
  const recentModels = useMemo(() => getRecentModelNames(batches, 6), [batches]);
  const [userModelName, setUserModelName] = useState<string | null>(null);
  const modelName = userModelName ?? (recentModels[0] ?? '');
  const setModelName = (name: string) => setUserModelName(name);

  const [labelColor, setLabelColor] = useState<LabelColor>('kraft');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // List State
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingBatch, setDeletingBatch] = useState<ProductionBatch | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    const trimmedModel = modelName.trim();
    if (!trimmedModel) {
      showToast({ message: 'Lütfen model / iş adını girin', tone: 'warning' });
      return;
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast({ message: 'Lütfen geçerli bir adet girin (0\'dan büyük)', tone: 'warning' });
      return;
    }

    setSaving(true);
    try {
      await addProductionBatch({
        model_name: trimmedModel,
        label_color: labelColor,
        quantity: qty,
        date: date || todayISO(),
        note: note.trim() || null,
      });

      hapticSuccess();
      showToast({
        message: `${trimmedModel} için ${qty.toLocaleString('tr-TR')} adet parti kaydedildi`,
        tone: 'success',
      });

      // Clear quantity and note for next entry, keep model name for ease of repeated batches
      setQuantity('');
      setNote('');
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Parti kaydedilemedi',
        tone: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingBatch) return;
    setDeleting(true);
    try {
      await deleteProductionBatch(deletingBatch.id);
      hapticSuccess();
      showToast({ message: 'Parti kaydı silindi', tone: 'info' });
      setDeletingBatch(null);
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Kayıt silinemedi',
        tone: 'warning',
      });
    } finally {
      setDeleting(false);
    }
  };

  const groupedModels = useMemo(() => {
    const groups = groupBatchesByModel(batches);
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return groups.filter((g) => g.modelName.toLocaleLowerCase('tr-TR').includes(q));
  }, [batches, searchQuery]);

  const totalProductionCount = useMemo(() => {
    return batches.reduce((sum, b) => sum + b.quantity, 0);
  }, [batches]);

  const selectedColorMeta = LABEL_COLOR_MAP.get(labelColor);

  return (
    <Screen keyboard>
      <Header
        title="Üretim / Parti Takibi"
        back
        compact
        subtitle={`${totalProductionCount.toLocaleString('tr-TR')} adet toplam üretim`}
      />

      <View style={{ marginTop: 12, marginBottom: 16 }}>
        <SegmentedControl
          options={[
            { value: 'gir', label: 'Parti Gir' },
            { value: 'liste', label: `Modeller & Geçmiş (${groupedModels.length})` },
          ]}
          value={tab}
          onChange={(v) => {
            hapticLight();
            setTab(v as 'gir' | 'liste');
          }}
        />
      </View>

      {tab === 'gir' ? (
        <View style={{ gap: 16 }}>
          {/* 1. Model / İş Adı */}
          <Card padded>
            <Text style={[type.titleMd, { color: c.text, fontWeight: '700', marginBottom: 4 }]}>
              1. Model / İş Adı
            </Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginBottom: 12 }]}>
              Üretilen parti hangi modele ait?
            </Text>

            {recentModels.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={[type.labelSm, { color: c.textSecondary, marginBottom: 6, fontWeight: '600' }]}>
                  Son Kullanılan Modeller
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {recentModels.map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      selected={modelName.trim().toLocaleLowerCase('tr-TR') === m.toLocaleLowerCase('tr-TR')}
                      onPress={() => setModelName(m)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <TextField
              label="Model Adı veya Kodu"
              placeholder="Örn: ATTIS-55 veya Keten Gömlek"
              value={modelName}
              onChangeText={setModelName}
            />
          </Card>

          {/* 2. Etiket Rengi */}
          <Card padded>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[type.titleMd, { color: c.text, fontWeight: '700' }]}>
                2. Meto Etiket Rengi
              </Text>
              {selectedColorMeta ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: selectedColorMeta.hex,
                      borderColor: selectedColorMeta.borderHex ?? c.border,
                      borderWidth: selectedColorMeta.borderHex ? 1 : 0,
                    }}
                  />
                  <Text style={[type.labelSm, { color: c.primary, fontWeight: '600' }]}>
                    {selectedColorMeta.label}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[type.bodySm, { color: c.textMuted, marginBottom: 12 }]}>
              Bu partide ürünlerin üzerine basılan etiket rengini seçin.
            </Text>

            {/* Renk Seçici Grid */}
            <View style={styles.colorGrid}>
              {LABEL_COLORS.map((item) => {
                const isSelected = labelColor === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      hapticLight();
                      setLabelColor(item.id);
                    }}
                    style={({ pressed }) => [
                      styles.colorButton,
                      {
                        backgroundColor: item.hex,
                        borderColor: isSelected ? c.primary : item.borderHex ?? 'rgba(0,0,0,0.12)',
                        borderWidth: isSelected ? 3 : 1,
                        opacity: pressed ? 0.85 : 1,
                        transform: [{ scale: isSelected ? 1.08 : 1 }],
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: isSelected }}
                  >
                    {isSelected ? (
                      <Check size={20} color={item.textHex} strokeWidth={3} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* 3. Parti Adedi ve Tarih */}
          <Card padded>
            <Text style={[type.titleMd, { color: c.text, fontWeight: '700', marginBottom: 4 }]}>
              3. Parti Detayları
            </Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginBottom: 12 }]}>
              Adet ve tarih bilgilerini girin.
            </Text>

            <View style={{ gap: 12 }}>
              <TextField
                label="Toplam Adet"
                placeholder="Örn: 2000"
                keyboardType="numeric"
                value={quantity}
                onChangeText={(text) => setQuantity(text.replace(/[^0-9]/g, ''))}
              />

              <DateField
                label="Parti Tarihi"
                value={date}
                onPick={setDate}
              />

              <TextField
                label="Not (İsteğe Bağlı)"
                placeholder="Örn: 1. parti, kumaş defosu ayrıldı vb."
                value={note}
                onChangeText={setNote}
              />
            </View>
          </Card>

          {/* Kaydet Butonu */}
          <Button
            label="Partiyi Kaydet"
            onPress={handleSave}
            loading={saving}
          />
        </View>
      ) : (
        /* Modeller & Geçmiş Görünümü */
        <View style={{ gap: 14 }}>
          {batches.length > 0 ? (
            <TextField
              placeholder="Model adına göre filtrele..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              right={<Search size={18} color={c.textMuted} />}
            />
          ) : null}

          {groupedModels.length === 0 ? (
            <EmptyState
              icon={<Layers size={40} color={c.textMuted} />}
              title={searchQuery ? 'Model bulunamadı' : 'Henüz parti kaydı yok'}
              subtitle={
                searchQuery
                  ? 'Arama kriterinize uygun model bulunamadı.'
                  : 'Yeni bir parti girişi yapmak için "Parti Gir" sekmesini kullanabilirsiniz.'
              }
            />
          ) : (
            groupedModels.map((group) => (
              <Card key={group.modelKey} padded style={{ gap: 12 }}>
                {/* Kart Başlığı */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[type.titleMd, { color: c.text, fontWeight: '700' }]}>
                      {group.modelName}
                    </Text>
                    <Text style={[type.labelSm, { color: c.textMuted, marginTop: 2 }]}>
                      Son işlem: {formatTarihKisa(group.lastDate)} · {group.batches.length} parti
                    </Text>
                  </View>
                  <Badge
                    label={`${group.totalQuantity.toLocaleString('tr-TR')} adet`}
                    tone="accent"
                  />
                </View>

                {/* Renk Kırılımı Etiketleri */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {group.colorBreakdown.map((item) => (
                    <View
                      key={item.color}
                      style={[
                        styles.colorBreakdownPill,
                        {
                          backgroundColor: c.surfaceContainerLow,
                          borderColor: c.border,
                          borderRadius: radius.pill,
                        },
                      ]}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: item.meta.hex,
                          borderColor: item.meta.borderHex ?? 'rgba(0,0,0,0.1)',
                          borderWidth: item.meta.borderHex ? 1 : 0,
                        }}
                      />
                      <Text style={[type.labelSm, { color: c.text, fontWeight: '600' }]}>
                        {item.meta.label}:
                      </Text>
                      <Text style={[type.labelSm, { color: c.primary, fontWeight: '700' }]}>
                        {item.quantity.toLocaleString('tr-TR')}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Partiler Listesi */}
                <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 8 }}>
                  <Text style={[type.labelSm, { color: c.textSecondary, fontWeight: '600' }]}>
                    Parti Kayıtları
                  </Text>
                  {group.batches.map((b) => {
                    const colorMeta = LABEL_COLOR_MAP.get(b.label_color);
                    return (
                      <View
                        key={b.id}
                        style={[
                          styles.batchRow,
                          {
                            backgroundColor: c.surfaceContainerLowest,
                            borderColor: c.border,
                            borderRadius: radius.card,
                          },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                          <View
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 8,
                              backgroundColor: colorMeta?.hex ?? '#ccc',
                              borderColor: colorMeta?.borderHex ?? 'rgba(0,0,0,0.1)',
                              borderWidth: colorMeta?.borderHex ? 1 : 0,
                            }}
                          />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={[type.bodySm, { color: c.text, fontWeight: '700' }]}>
                                {b.quantity.toLocaleString('tr-TR')} adet
                              </Text>
                              <Text style={[type.labelSm, { color: c.textMuted }]}>
                                ({colorMeta?.label})
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <Text style={[type.small, { color: c.textSecondary }]}>
                                {formatTarihKisa(b.date)}
                              </Text>
                              {b.note ? (
                                <Text
                                  style={[type.small, { color: c.textMuted, fontStyle: 'italic' }]}
                                  numberOfLines={1}
                                >
                                  · {b.note}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </View>

                        <Pressable
                          hitSlop={8}
                          onPress={() => {
                            hapticWarning();
                            setDeletingBatch(b);
                          }}
                          style={({ pressed }) => [
                            styles.deleteButton,
                            { opacity: pressed ? 0.6 : 1 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Partiyi Sil"
                        >
                          <Trash2 size={16} color={c.danger} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </Card>
            ))
          )}
        </View>
      )}

      {/* Silme Onay Modalı */}
      <ConfirmSheet
        visible={!!deletingBatch}
        onClose={() => setDeletingBatch(null)}
        title="Parti Kaydını Sil"
        message={`${deletingBatch?.model_name} modeline ait ${deletingBatch?.quantity.toLocaleString('tr-TR')} adetlik parti kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmLabel={deleting ? 'Siliniyor…' : 'Evet, Sil'}
        destructive
        onConfirm={confirmDelete}
      />

      <View style={{ height: 32 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  colorButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorBreakdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderWidth: 1,
  },
  deleteButton: {
    padding: 6,
  },
});
