import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { Phone, MessageCircle, Pencil, HandCoins, LogOut, CalendarOff, Copy, MoreVertical, SearchX, CalendarDays, Wallet } from 'lucide-react-native';
import {
  ActionSheet,
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  ConfirmSheet,
  DateStepper,
  EmptyState,
  Header,
  IconButton,
  MoneyField,
  Screen,
  SectionHeader,
  SegmentedControl,
  StatusPill,
  TextField,
  useToast,
} from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import {
  useDebts,
  useDebtPayments,
  useDepartments,
  useEmployee,
  useLeaveAdjustments,
  useMonthAttendance,
  useSalaries,
} from '../../data/hooks';
import { calculateDebtBalance } from '../../domain/debts';
import { leaveStatus } from '../../domain/leave';
import { getMonthPlans, todayISO } from '../../domain/schedule';
import { adjustLeave, deactivateEmployee } from '../../data/repo';
import { formatMoney, formatTarihKisa, maskIban, maskTc, formatTarih } from '../../utils/format';
import { useDataStore } from '../../data/store';

/** Çalışan detayı (PLAN 6.5): Puantaj · Para · Bilgiler sekmeleri */
export default function CalisanDetay() {
  const { c, type, statusColor } = useTheme();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const employee = useEmployee(id);
  const departments = useDepartments();
  const salaries = useSalaries(id);
  const debts = useDebts(id);
  const payments = useDebtPayments(id);
  const leaveAdj = useLeaveAdjustments(id);
  const [tab, setTab] = useState<'puantaj' | 'para' | 'bilgiler'>('puantaj');
  const [menuOpen, setMenuOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitDate, setExitDate] = useState(todayISO());
  const [leaveOpen, setLeaveOpen] = useState(false);

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const currentMonth = useMemo(() => new Date().getMonth() + 1, []);
  const monthAtt = useMonthAttendance(currentYear, currentMonth);
  const schedule = useDataStore((s) => s.db.schedule_days);
  const calendarEvents = useDataStore((s) => s.db.calendar_events);
  const orgIdForEvents = useDataStore((s) => s.orgId);
  const events = useMemo(
    () => calendarEvents.filter((e) => e.org_id === orgIdForEvents),
    [calendarEvents, orgIdForEvents]
  );
  const employeeAtt = useMemo(() => monthAtt.filter((a) => a.employee_id === id), [monthAtt, id]);
  const allAttendance = useDataStore((s) => s.db.attendance);
  const usedLeaveDays = useMemo(
    () => allAttendance.filter((a) => a.employee_id === id && a.status === 'yillik_izin').length,
    [allAttendance, id]
  );

  const ym = todayISO().slice(0, 7);
  const balances = useMemo(
    () => debts.map((d) => calculateDebtBalance(d, payments, ym)).sort((a, b) => b.debt.given_at.localeCompare(a.debt.given_at)),
    [debts, payments, ym]
  );
  const openDebt = balances.filter((b) => !b.isFullyPaid).reduce((s, b) => s + b.remaining, 0);
  const monthAbsence = employeeAtt.filter((a) => a.status === 'gelmedi' || a.status === 'ucretsiz_izin').length;

  const leave = useMemo(
    () => (employee ? leaveStatus(employee, leaveAdj, usedLeaveDays, todayISO()) : null),
    [employee, leaveAdj, usedLeaveDays]
  );

  const monthPlans = useMemo(
    () => getMonthPlans(currentYear, currentMonth, schedule, events),
    [schedule, events, currentYear, currentMonth]
  );
  const attByDay = new Map(employeeAtt.map((a) => [a.day, a]));

  if (!employee) {
    return (
      <Screen>
        <Header title="Çalışan" back compact />
        <EmptyState
          icon={<SearchX size={32} color={c.primary} strokeWidth={2.0} />}
          title="Çalışan bulunamadı"
        />
      </Screen>
    );
  }

  const kidem = hesaplaKidem(employee.start_date);
  const dept = departments.find((d) => d.id === employee.department_id);

  return (
    <Screen scroll={false} padded={false}>
      <Header
        title={employee.full_name}
        back
        compact
        right={
          <IconButton
            icon={<MoreVertical size={20} color={c.text} />}
            tone="secondary"
            label="İşlemler"
            onPress={() => setMenuOpen(true)}
          />
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Üst kart */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar name={employee.full_name} photoUrl={employee.photo_url} size={64} />
            <View style={{ flex: 1 }}>
              <Text style={[type.title, { color: c.text, fontSize: 20 }]}>{employee.full_name}</Text>
              <Text style={[type.small, { color: c.textMuted }]}>
                {dept?.name ?? 'Departman yok'} · Kıdem {kidem}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            {employee.phone ? (
              <>
                <Button label="Ara" variant="secondary" size="md" icon={<Phone size={16} color={c.text} />} onPress={() => Linking.openURL(`tel:${employee.phone}`)} full={false} />
                <Button
                  label="WhatsApp"
                  variant="secondary"
                  size="md"
                  icon={<MessageCircle size={16} color={c.success} />}
                  onPress={() => Linking.openURL(`https://wa.me/90${(employee.phone ?? '').replace(/\D/g, '').replace(/^0/, '')}`)}
                  full={false}
                />
              </>
            ) : null}
          </View>
          {!employee.active && employee.end_date ? (
            <View style={{ marginTop: 10 }}>
              <Badge label={`${formatTarih(employee.end_date)} tarihinde ayrıldı`} tone="danger" />
            </View>
          ) : null}
        </Card>

        {/* Özet şeridi */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Card style={{ flex: 1 }}>
            <Text style={[type.label, { color: c.textMuted }]}>BU AY DEVAMSIZLIK</Text>
            <Text style={[type.subtitle, { color: monthAbsence > 0 ? c.danger : c.success, marginTop: 4 }]}>{monthAbsence} gün</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={[type.label, { color: c.textMuted }]}>AÇIK BORÇ</Text>
            <Text style={[type.subtitle, { color: openDebt > 0 ? c.warning : c.success, marginTop: 4 }]}>{formatMoney(openDebt)}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={[type.label, { color: c.textMuted }]}>KALAN İZİN</Text>
            <Text style={[type.subtitle, { color: c.primary, marginTop: 4 }]}>{leave ? `${leave.remaining} gün` : '—'}</Text>
          </Card>
        </View>

        <View style={{ marginTop: 16 }}>
          <SegmentedControl
            options={[
              { value: 'puantaj', label: 'Puantaj' },
              { value: 'para', label: 'Para' },
              { value: 'bilgiler', label: 'Bilgiler' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>

        {tab === 'puantaj' ? (
          <View style={{ marginTop: 16 }}>
            <Text style={[type.small, { color: c.textMuted, marginBottom: 8 }]}>
              Bu ayın puantajı (renkler durumları gösterir)
            </Text>
            <Card padded={false}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 6 }}>
                {monthPlans.days.map((p) => {
                  const rec = attByDay.get(p.date);
                  let bg = c.surfaceSubtle;
                  if (!p.isWorkday) bg = c.border;
                  else if (rec) bg = statusColor(rec.status).main;
                  else bg = statusColor('geldi').soft;
                  return (
                    <View
                      key={p.date}
                      style={{
                        width: '12.5%',
                        aspectRatio: 1,
                        borderRadius: 8,
                        backgroundColor: bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 10, color: c.textSecondary }}>{Number(p.date.slice(8))}</Text>
                    </View>
                  );
                })}
              </View>
            </Card>
            <SectionHeader title="BU AY KAYITLARI" />
            {employeeAtt.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={32} color={c.primary} strokeWidth={2.0} />}
                title="Bu ay kayıt yok"
                subtitle="Tüm günler 'Geldi' kabul edilir."
              />
            ) : (
              <Card padded={false}>
                {employeeAtt.map((a, i) => (
                  <View
                    key={a.id}
                    style={[styles.listRow, { borderBottomWidth: i < employeeAtt.length - 1 ? 1 : 0, borderBottomColor: c.border }]}
                  >
                    <Text style={[type.small, { color: c.textSecondary, width: 74 }]}>{formatTarihKisa(a.day)}</Text>
                    <StatusPill status={a.status} size="sm" />
                  </View>
                ))}
              </Card>
            )}
          </View>
        ) : null}

        {tab === 'para' ? (
          <View style={{ marginTop: 16 }}>
            <SectionHeader title="BORÇLAR" action={<Button label="Avans Ver" size="md" variant="accent" onPress={() => router.push({ pathname: '/avans-ver', params: { employeeId: employee.id } })} />} />
            {balances.length === 0 ? (
              <EmptyState
                icon={<Wallet size={32} color={c.primary} strokeWidth={2.0} />}
                title="Borç kaydı yok"
              />
            ) : (
              balances.map((b) => (
                <Card key={b.debt.id} style={{ marginBottom: 10 }} onPress={() => router.push(`/borc/${b.debt.id}`)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[type.body, { color: c.text }]}>
                      {b.debt.type === 'avans' ? 'Avans' : 'Borç'} · {formatTarihKisa(b.debt.given_at)}
                    </Text>
                    <Text style={[type.body, { color: b.isFullyPaid ? c.success : c.warning, fontWeight: '700' }]}>
                      {b.isFullyPaid ? 'Kapandı' : formatMoney(b.remaining)}
                    </Text>
                  </View>
                  {b.debt.description ? (
                    <Text style={[type.small, { color: c.textMuted, marginTop: 2 }]}>{b.debt.description}</Text>
                  ) : null}
                  <Text style={[type.small, { color: c.textMuted, marginTop: 4 }]}>
                    {b.debt.installments > 1 ? `${b.debt.installments} taksit` : 'Tek seferde'} · ödenen {formatMoney(b.totalPaid)}
                  </Text>
                </Card>
              ))
            )}

            <SectionHeader title="MAAŞ GEÇMİŞİ" />
            <Card padded={false}>
              {[...salaries].reverse().map((s, i, arr) => (
                <View key={s.id} style={[styles.listRow, { borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: c.border }]}>
                  <Text style={[type.small, { color: c.textSecondary }]}>{formatTarih(s.effective_from)}</Text>
                  <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>{formatMoney(s.amount)}</Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {tab === 'bilgiler' ? (
          <View style={{ marginTop: 16 }}>
            <Card padded={false}>
              {[
                { label: 'Telefon', value: employee.phone ?? '—' },
                { label: 'TC Kimlik', value: maskTc(employee.tc_no) },
                { label: 'IBAN', value: maskIban(employee.iban), copy: employee.iban },
                { label: 'İşe Giriş', value: formatTarih(employee.start_date) },
                { label: 'Doğum Tarihi', value: employee.birth_date ? formatTarih(employee.birth_date) : '—' },
                { label: 'Adres', value: employee.address ?? '—' },
                { label: 'Acil Durum', value: employee.emergency_contact ?? '—' },
                { label: 'Notlar', value: employee.notes ?? '—' },
              ].map((row) => (
                <View key={row.label} style={[styles.listRow, { borderBottomColor: c.border }]}>
                  <Text style={[type.small, { color: c.textMuted }]}>{row.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                    <Text style={[type.small, { color: c.text }]} numberOfLines={1}>
                      {row.value}
                    </Text>
                    {row.copy ? (
                      <Button
                        label=""
                        variant="ghost"
                        size="md"
                        full={false}
                        icon={<Copy size={16} color={c.primary} />}
                        onPress={() => {
                          if (row.copy) {
                            Clipboard.setStringAsync(row.copy).catch(() => undefined);
                            showToast({ message: 'IBAN kopyalandı', tone: 'success' });
                          }
                        }}
                      />
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={employee.full_name}
        actions={[
          {
            label: 'Düzenle',
            icon: <Pencil size={20} color={c.text} />,
            onPress: () => router.push(`/personel/duzenle?id=${employee.id}`),
          },
          {
            label: 'Avans Ver',
            icon: <HandCoins size={20} color={c.text} />,
            onPress: () => router.push({ pathname: '/avans-ver', params: { employeeId: employee.id } }),
          },
          {
            label: 'İzin Gir',
            icon: <CalendarOff size={20} color={c.text} />,
            onPress: () => setLeaveOpen(true),
          },
          ...(employee.active
            ? [
                {
                  label: 'İşten Çıkışını Yap',
                  icon: <LogOut size={20} color={c.danger} />,
                  destructive: true,
                  onPress: () => setExitOpen(true),
                },
              ]
            : []),
        ]}
      />

      <BottomSheet visible={exitOpen} onClose={() => setExitOpen(false)} title="İşten Çıkış">
        <Text style={[type.small, { color: c.textSecondary, marginBottom: 12 }]}>
          {employee.full_name} için çıkış tarihini seçin. Kalan borcu ({formatMoney(openDebt)}) son maaşından kesilebilir.
        </Text>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <DateStepper date={exitDate} onChange={setExitDate} />
        </View>
        <Button
          label="Çıkışı Kaydet"
          variant="danger"
          onPress={() => {
            deactivateEmployee(employee.id, exitDate);
            showToast({ message: 'Çıkış kaydedildi', tone: 'success' });
            setExitOpen(false);
          }}
        />
      </BottomSheet>

      <BottomLeaveSheet
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onApply={(days, reason) => {
          adjustLeave({ employee_id: employee.id, days, reason });
          showToast({ message: `${days > 0 ? '+' : ''}${days} gün izin bakiyesi`, tone: 'success' });
        }}
      />
    </Screen>
  );
}

function BottomLeaveSheet({
  visible,
  onClose,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (days: number, reason: string) => void;
}) {
  const [days, setDays] = useState(1);
  const [dir, setDir] = useState<'ekle' | 'dus'>('ekle');
  const [reason, setReason] = useState('Devreden izin');
  const signed = dir === 'ekle' ? days : -days;
  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      title="İzin Bakiyesi Düzelt"
      message="Devreden izin günü ekleyin veya kullanılan izni bakiyeden düşün."
      confirmLabel={`${signed > 0 ? '+' : ''}${signed} günü uygula`}
      onConfirm={() => {
        onApply(signed, reason || 'İzin düzeltmesi');
        onClose();
      }}
    >
      <SegmentedControl
        options={[
          { value: 'ekle', label: 'Bakiyeye Ekle' },
          { value: 'dus', label: 'Bakiyeden Düş' },
        ]}
        value={dir}
        onChange={(v) => setDir(v as 'ekle' | 'dus')}
      />
      <MoneyField label="Gün" value={days} onChange={(v) => setDays(v)} unit="gün" />
      <TextField label="Gerekçe" value={reason} onChangeText={setReason} placeholder="Devreden izin / kullanıldı" />
    </ConfirmSheet>
  );
}

function hesaplaKidem(start: string): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const now = new Date();
  let months = (now.getFullYear() - sy) * 12 + (now.getMonth() + 1 - sm);
  if (now.getDate() < sd) months -= 1;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y} yıl ${m} ay`;
}

const styles = StyleSheet.create({
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
});
