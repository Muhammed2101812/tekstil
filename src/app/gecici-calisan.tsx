import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  Trash2,
  Users,
} from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  DateField,
  EmptyState,
  Header,
  MoneyField,
  Screen,
  SegmentedControl,
  StatCard,
  StatGrid,
  TextField,
  useToast,
} from '../ui';
import { useTheme } from '../theme/ThemeProvider';
import { useTempWorkLogs } from '../data/hooks';
import { addTempWorkLog, deleteTempWorkLog, markTempWorkPaid } from '../data/repo';
import {
  calculateTempWorkerSummary,
  getLastLogOfWorker,
  getRecentTempWorkerNames,
  groupTempWorkLogsByWorker,
  normalizeWorkerName,
} from '../domain/temp-workers';
import { SalaryPaymentMethod, TempWorkDurationType, TempWorkLog } from '../types';
import { addDaysISO, todayISO } from '../domain/schedule';
import { formatMoney, formatTarihKisa } from '../utils/format';
import { hapticLight, hapticSuccess } from '../utils/haptics';

const COMMON_TASKS = [
  'Paketleme',
  'İplik Temizleme',
  'Ütü Yardımı',
  'Kesim Yardımı',
  'Yükleme / Taşıma',
  'Ortacı / Genel',
];

export default function GeciciCalisanScreen() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const logs = useTempWorkLogs();

  const [tab, setTab] = useState<'gir' | 'liste'>('gir');

  // Form State
  const recentWorkers = useMemo(() => getRecentTempWorkerNames(logs, 8), [logs]);
  const [workerName, setWorkerName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(todayISO());
  const [dayCount, setDayCount] = useState<number>(1);
  const [durationType, setDurationType] = useState<TempWorkDurationType>('tam_gun');
  const [hours, setHours] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [dailyWage, setDailyWage] = useState<number>(0);
  const [paid, setPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SalaryPaymentMethod>('nakit');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // List State
  const [searchQuery, setSearchQuery] = useState('');
  const [listMode, setListMode] = useState<'kisi' | 'gun'>('kisi');
  const [filterOnlyUnpaid, setFilterOnlyUnpaid] = useState(false);
  const [deletingLog, setDeletingLog] = useState<TempWorkLog | null>(null);
  const [payingLog, setPayingLog] = useState<TempWorkLog | null>(null);

  const fillWorkerInfo = (name: string) => {
    setWorkerName(name);
    const last = getLastLogOfWorker(logs, name);
    if (last) {
      if (last.phone) setPhone(last.phone);
      if (last.daily_wage) setDailyWage(last.daily_wage);
      if (last.task_description) setTaskDescription(last.task_description);
      if (last.duration_type) setDurationType(last.duration_type);
    }
  };

  const handleSave = async () => {
    const trimmed = normalizeWorkerName(workerName);
    if (!trimmed) {
      showToast({ message: 'Lütfen çalışan adını girin', tone: 'warning' });
      return;
    }

    // Hourly duration: normalize Turkish comma, reject garbage/zero/negative
    // (parseFloat alone turned "4,5" into 4 and garbage into NaN → null → "0 sa").
    let parsedHours: number | null = null;
    if (durationType === 'saatlik') {
      parsedHours = Number.parseFloat(hours.trim().replace(',', '.'));
      if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
        showToast({ message: 'Geçerli bir saat girin (örn: 4,5)', tone: 'warning' });
        return;
      }
    }

    setSaving(true);
    try {
      const count = Math.max(1, Math.min(10, dayCount));

      // Tek gün veya peş peşe N gün
      for (let i = 0; i < count; i++) {
        const entryDate = i === 0 ? date : addDaysISO(date, i);
        await addTempWorkLog({
          worker_name: trimmed,
          phone: phone.trim() || null,
          date: entryDate,
          duration_type: durationType,
          hours: parsedHours,
          task_description: taskDescription.trim() || null,
          daily_wage: dailyWage,
          paid,
          paid_at: paid ? entryDate : null,
          payment_method: paid ? paymentMethod : null,
          note: note.trim() || null,
        });
      }

      hapticSuccess();
      showToast({
        message: `${trimmed} için ${count > 1 ? count + ' günlük ' : ''}çalışma kaydedildi`,
        tone: 'success',
      });

      // Formu temizle
      setWorkerName('');
      setPhone('');
      setDayCount(1);
      setHours('');
      setNote('');
      setDailyWage(0);
      setPaid(false);
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Kayıt kaydedilemedi',
        tone: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  const quickAddTodayForWorker = async (name: string, defaultWage: number, task: string | null) => {
    try {
      await addTempWorkLog({
        worker_name: name,
        date: todayISO(),
        duration_type: 'tam_gun',
        daily_wage: defaultWage,
        task_description: task,
        paid: false,
      });
      hapticSuccess();
      showToast({ message: `${name} için bugüne kayıt eklendi`, tone: 'success' });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Kayıt eklenemedi', tone: 'warning' });
    }
  };

  const confirmDelete = async () => {
    if (!deletingLog) return;
    try {
      await deleteTempWorkLog(deletingLog.id);
      hapticSuccess();
      showToast({ message: 'Kayıt silindi', tone: 'info' });
      setDeletingLog(null);
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Silinemedi', tone: 'warning' });
    }
  };

  const confirmPay = async () => {
    if (!payingLog) return;
    try {
      await markTempWorkPaid(payingLog.id, 'nakit', todayISO());
      hapticSuccess();
      showToast({ message: 'Ödendi olarak işaretlendi', tone: 'success' });
      setPayingLog(null);
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'İşlem başarısız', tone: 'warning' });
    }
  };

  const summary = useMemo(() => calculateTempWorkerSummary(logs), [logs]);

  const filteredLogs = useMemo(() => {
    let list = logs;
    if (filterOnlyUnpaid) {
      list = list.filter((l) => !l.paid && l.daily_wage > 0);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
      list = list.filter((l) => l.worker_name.toLocaleLowerCase('tr-TR').includes(q));
    }
    return list;
  }, [logs, filterOnlyUnpaid, searchQuery]);

  const groupedWorkers = useMemo(() => {
    return groupTempWorkLogsByWorker(filteredLogs);
  }, [filteredLogs]);

  return (
    <Screen keyboard>
      <Header
        title="Geçici / Günlük Çalışan"
        back
        compact
        subtitle={`${summary.totalEntriesCount} yevmiye/yardım · ${formatMoney(summary.unpaidWage)} bekleyen`}
      />

      <View style={{ marginTop: 12, marginBottom: 16 }}>
        <SegmentedControl
          options={[
            { value: 'gir', label: 'Not Al / Kaydet' },
            { value: 'liste', label: `Geçmiş & Kişiler (${summary.totalEntriesCount})` },
          ]}
          value={tab}
          onChange={(v) => {
            hapticLight();
            setTab(v as 'gir' | 'liste');
          }}
        />
      </View>

      {tab === 'gir' ? (
        <View style={{ gap: 14 }}>
          {/* 1. Çalışan Adı ve Hızlı Seçim */}
          <Card padded>
            <Text style={[type.titleMd, { color: c.text, fontWeight: '700', marginBottom: 4 }]}>
              1. Çalışan Bilgisi
            </Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginBottom: 10 }]}>
              Gelen kişinin adını yazın veya daha önce gelenlerden seçin.
            </Text>

            {recentWorkers.length > 0 ? (
              <View style={{ marginBottom: 10 }}>
                <Text style={[type.labelSm, { color: c.textSecondary, marginBottom: 6, fontWeight: '600' }]}>
                  Son Gelen Kişiler
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {recentWorkers.map((name) => (
                    <Chip
                      key={name}
                      label={name}
                      selected={workerName.trim().toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR')}
                      onPress={() => fillWorkerInfo(name)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <TextField
              label="Çalışan Adı Soyadı veya Lakap"
              placeholder="Örn: Hasan Usta veya Ayşe (Paket)"
              value={workerName}
              onChangeText={setWorkerName}
            />

            <View style={{ marginTop: 10 }}>
              <TextField
                label="Telefon (İsteğe bağlı)"
                placeholder="Örn: 05xx xxx xx xx"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>
          </Card>

          {/* 2. Tarih ve Süre */}
          <Card padded>
            <Text style={[type.titleMd, { color: c.text, fontWeight: '700', marginBottom: 8 }]}>
              2. Tarih ve Çalışma Süresi
            </Text>

            <View style={{ marginBottom: 12 }}>
              <DateField label="Tarih" value={date} onPick={setDate} />
            </View>

            {/* Kaç Gün Çalıştı? */}
            <View style={{ marginBottom: 12 }}>
              <Text style={[type.label, { color: c.textMuted, marginBottom: 6 }]}>ÇALIŞMA GÜN SAYISI</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((cnt) => (
                  <Chip
                    key={`day-${cnt}`}
                    label={cnt === 1 ? '1 Gün' : `${cnt} Gün`}
                    selected={dayCount === cnt}
                    onPress={() => setDayCount(cnt)}
                  />
                ))}
              </View>
            </View>

            {/* Çalışma Şekli */}
            <Text style={[type.label, { color: c.textMuted, marginBottom: 6 }]}>ÇALIŞMA ŞEKLİ</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip
                label="Tam Gün"
                selected={durationType === 'tam_gun'}
                onPress={() => setDurationType('tam_gun')}
              />
              <Chip
                label="Yarım Gün"
                selected={durationType === 'yarim_gun'}
                onPress={() => setDurationType('yarim_gun')}
              />
              <Chip
                label="Saatlik"
                selected={durationType === 'saatlik'}
                onPress={() => setDurationType('saatlik')}
              />
            </View>

            {durationType === 'saatlik' ? (
              <View style={{ marginTop: 10 }}>
                <TextField
                  label="Çalışılan Saat"
                  placeholder="Örn: 4.5"
                  keyboardType="numeric"
                  value={hours}
                  onChangeText={setHours}
                />
              </View>
            ) : null}
          </Card>

          {/* 3. Yapılan İş */}
          <Card padded>
            <Text style={[type.titleMd, { color: c.text, fontWeight: '700', marginBottom: 6 }]}>
              3. Yapılan İş & Departman
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
              {COMMON_TASKS.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  selected={taskDescription === t}
                  onPress={() => setTaskDescription(t)}
                />
              ))}
            </ScrollView>
            <TextField
              label="Açıklama / İş Detayı"
              placeholder="Örn: Düğme dikimi, sevkiyat yüklemesi vb."
              value={taskDescription}
              onChangeText={setTaskDescription}
            />
          </Card>

          {/* 4. Yevmiye ve Ödeme */}
          <Card padded>
            <Text style={[type.titleMd, { color: c.text, fontWeight: '700', marginBottom: 4 }]}>
              4. Yevmiye / Ücret ve Ödeme Durumu
            </Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginBottom: 10 }]}>
              Ücret girilmezse (0 ₺) sadece not olarak kaydedilir.
            </Text>

            <MoneyField
              label="Günlük Yevmiye / Tutar (₺)"
              value={dailyWage}
              onChange={setDailyWage}
            />

            {dailyWage > 0 ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[type.label, { color: c.textMuted, marginBottom: 6 }]}>ÖDEME DURUMU</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Chip
                    label="Ödendi"
                    selected={paid}
                    onPress={() => setPaid(true)}
                  />
                  <Chip
                    label="Daha Sonra Ödenecek"
                    selected={!paid}
                    onPress={() => setPaid(false)}
                  />
                </View>

                {paid ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Chip
                      label="Nakit Ödendi"
                      selected={paymentMethod === 'nakit'}
                      onPress={() => setPaymentMethod('nakit')}
                    />
                    <Chip
                      label="Banka / Havale"
                      selected={paymentMethod === 'banka'}
                      onPress={() => setPaymentMethod('banka')}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={{ marginTop: 10 }}>
              <TextField
                label="Özel Not (İsteğe bağlı)"
                placeholder="Örn: Cuma günü diğer işlerle birlikte ödenecek"
                value={note}
                onChangeText={setNote}
              />
            </View>
          </Card>

          <Button
            label={saving ? 'Kaydediliyor…' : 'Kaydet'}
            onPress={handleSave}
            disabled={saving}
          />
          <View style={{ height: 40 }} />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {/* İstatistikler */}
          <StatGrid>
            <StatCard label="Toplam Kayıt" value={`${summary.totalEntriesCount} gün`} />
            <StatCard
              label="Ödenmemiş Bakiye"
              value={formatMoney(summary.unpaidWage)}
              tone={summary.unpaidWage > 0 ? 'warning' : 'success'}
            />
          </StatGrid>

          {/* Filtreler */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip
              label="Kişi Bazlı"
              selected={listMode === 'kisi'}
              onPress={() => setListMode('kisi')}
            />
            <Chip
              label="Gün Gün Liste"
              selected={listMode === 'gun'}
              onPress={() => setListMode('gun')}
            />
            <Chip
              label="Yalnızca Bekleyenler"
              selected={filterOnlyUnpaid}
              onPress={() => setFilterOnlyUnpaid(!filterOnlyUnpaid)}
            />
          </View>

          <TextField
            label=""
            placeholder="İsimle ara…"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          {filteredLogs.length === 0 ? (
            <EmptyState
              icon={<Users size={32} color={c.primary} />}
              title="Kayıt bulunamadı"
              subtitle={
                filterOnlyUnpaid
                  ? 'Ödeme bekleyen geçici çalışan kaydı yok.'
                  : 'Henüz geçici veya günlük çalışan kaydı eklenmedi.'
              }
              action={
                <Button
                  label="+ Yeni Not Al / Kaydet"
                  size="md"
                  onPress={() => setTab('gir')}
                />
              }
            />
          ) : listMode === 'kisi' ? (
            /* Kişi Bazlı Kartlar */
            <View style={{ gap: 10 }}>
              {groupedWorkers.map((g) => (
                <Card key={g.workerName} padded>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.titleMd, { color: c.text, fontWeight: '700' }]}>
                        {g.workerName}
                      </Text>
                      <Text style={[type.bodySm, { color: c.textMuted, marginTop: 2 }]}>
                        {g.totalDays} gün çalıştı · Son: {formatTarihKisa(g.lastWorkedDate)}
                        {g.phone ? ` · 📞 ${g.phone}` : ''}
                      </Text>
                    </View>

                    {g.unpaidWage > 0 ? (
                      <Badge label={`${formatMoney(g.unpaidWage)} bekliyor`} tone="warning" />
                    ) : (
                      <Badge label="Ödendi" tone="success" />
                    )}
                  </View>

                  {/* Son Yapılan İşler */}
                  <View style={{ marginTop: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border }}>
                    <Text style={[type.small, { color: c.textSecondary }]}>
                      {g.logs.map((l) => `${formatTarihKisa(l.date)} (${l.task_description || 'Yardım'})`).slice(0, 3).join(' · ')}
                      {g.logs.length > 3 ? ` ve ${g.logs.length - 3} gün daha…` : ''}
                    </Text>
                  </View>

                  {/* Aksiyon Butonları */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Button
                      label="+ Bugün de Geldi"
                      size="sm"
                      variant="secondary"
                      onPress={() => {
                        const last = g.logs[0];
                        quickAddTodayForWorker(g.workerName, last?.daily_wage || 0, last?.task_description || null);
                      }}
                    />
                    {g.unpaidWage > 0 ? (
                      <Button
                        label="Ödendi İşaretle"
                        size="sm"
                        variant="accent"
                        onPress={() => {
                          const unpaidLog = g.logs.find((l) => !l.paid);
                          if (unpaidLog) setPayingLog(unpaidLog);
                        }}
                      />
                    ) : null}
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            /* Gün Gün Kronolojik Liste */
            <View style={{ gap: 8 }}>
              {filteredLogs.map((item) => (
                <Card key={item.id} padded>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>
                          {item.worker_name}
                        </Text>
                        <Badge
                          label={item.duration_type === 'tam_gun' ? 'Tam Gün' : item.duration_type === 'yarim_gun' ? 'Yarım Gün' : `${item.hours || 0} sa`}
                          tone="neutral"
                        />
                      </View>
                      <Text style={[type.small, { color: c.textMuted, marginTop: 2 }]}>
                        {formatTarihKisa(item.date)}
                        {item.task_description ? ` · ${item.task_description}` : ''}
                        {item.note ? ` · (${item.note})` : ''}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>
                        {item.daily_wage > 0 ? formatMoney(item.daily_wage) : 'Ücretsiz'}
                      </Text>
                      {item.daily_wage > 0 ? (
                        <Pressable
                          onPress={() => {
                            if (!item.paid) setPayingLog(item);
                          }}
                        >
                          <Badge
                            label={item.paid ? 'Ödendi' : 'Ödeme Bekliyor'}
                            tone={item.paid ? 'success' : 'warning'}
                          />
                        </Pressable>
                      ) : null}
                    </View>

                    <Pressable
                      onPress={() => setDeletingLog(item)}
                      hitSlop={8}
                      style={{ paddingLeft: 8 }}
                      accessibilityLabel="Kaydı sil"
                    >
                      <Trash2 size={16} color={c.danger} />
                    </Pressable>
                  </View>
                </Card>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </View>
      )}

      {/* Silme Onay Sayfası */}
      <ConfirmSheet
        visible={deletingLog !== null}
        onClose={() => setDeletingLog(null)}
        title="Kaydı Sil"
        message={`${deletingLog?.worker_name} isimli çalışanın ${deletingLog?.date} tarihli kaydı silinsin mi?`}
        confirmLabel="Sil"
        destructive
        onConfirm={confirmDelete}
      />

      {/* Ödeme Onay Sayfası */}
      <ConfirmSheet
        visible={payingLog !== null}
        onClose={() => setPayingLog(null)}
        title="Ödendi İşaretle"
        message={`${payingLog?.worker_name} için ${formatMoney(payingLog?.daily_wage || 0)} tutarındaki yevmiye ödendi olarak işaretlensin mi?`}
        confirmLabel="Ödendi"
        onConfirm={confirmPay}
      />
    </Screen>
  );
}
