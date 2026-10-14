import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Layers } from 'lucide-react-native';
import { Badge, Card, Header, Screen, SectionHeader, SegmentedControl, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useDataStore } from '../../data/store';
import { useDebts, useDepartments, useDebtPayments, useEmployees, useProductionBatches } from '../../data/hooks';
import { computePayrollForMonth } from '../../features/bordro/compute';
import { leaveStatus } from '../../domain/leave';
import { getMonthPlans, todayISO } from '../../domain/schedule';
import { formatTarihKisa, ayAdi } from '../../utils/format';

/** Raporlar (PLAN 6.8): PDF / Excel / WhatsApp paylaşımı */
export default function Raporlar() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [busy, setBusy] = useState<string | null>(null);

  const db = useDataStore((s) => s.db);
  const orgId = useDataStore((s) => s.orgId);
  const org = db.organizations.find((o) => o.id === orgId);
  const employees = useEmployees();
  const departments = useDepartments();
  const debts = useDebts();
  const payments = useDebtPayments();
  const batches = useProductionBatches();

  const ayBasligi = `${ayAdi(month)} ${year}`;
  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const productionStats = useMemo(() => {
    const monthBatches = batches.filter((b) => b.date.startsWith(ym));
    const totalQty = monthBatches.reduce((s, b) => s + b.quantity, 0);
    const distinctModels = new Set(monthBatches.map((b) => b.model_name.trim().toLocaleLowerCase('tr-TR'))).size;
    return {
      totalQty,
      batchCount: monthBatches.length,
      modelCount: distinctModels,
    };
  }, [batches, ym]);

  const monthInfo = useMemo(() => {
    const plans = getMonthPlans(year, month, db.schedule_days.filter((s) => s.org_id === orgId), db.calendar_events.filter((e) => e.org_id === orgId));
    const attendance = db.attendance.filter((a) => a.day.startsWith(ym));
    return { plans, attendance };
  }, [db.schedule_days, db.calendar_events, db.attendance, year, month, orgId, ym]);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Rapor oluşturulamadı', tone: 'warning' });
    } finally {
      setBusy(null);
    }
  };

  const activeEmployees = employees.filter((e) => e.start_date <= `${ym}-31` && (!e.end_date || e.end_date >= `${ym}-01`));

  /** Puantaj cetveli satırları: çalışan × gün hücreleri */
  const cetvelRows = () =>
    activeEmployees.map((emp) => ({
      name: emp.full_name,
      department: departments.find((d) => d.id === emp.department_id)?.name ?? null,
      days: monthInfo.plans.days.map((p) => monthInfo.attendance.find((a) => a.employee_id === emp.id && a.day === p.date)?.status ?? null),
    }));

  const reportDefs: { id: string; title: string; sub: string; run: () => Promise<void> }[] = [
    {
      id: 'puantaj-excel',
      title: 'Aylık Puantaj Cetveli',
      sub: 'Excel · klasik tekstil çizelgesi',
      run: () => import('../../export/excel').then((m) => m.sharePuantajExcel(cetvelRows(), monthInfo.plans.days, ayBasligi)),
    },
    {
      id: 'puantaj-pdf',
      title: 'Aylık Puantaj Cetveli',
      sub: 'PDF · yatay sayfa',
      run: () =>
        import('../../export/pdf').then((m) =>
          m.sharePuantajPdf({ name: org?.name ?? 'Firma' }, cetvelRows(), monthInfo.plans.days, ayBasligi)
        ),
    },
    {
      id: 'bordro-excel',
      title: 'Bordro Özeti',
      sub: 'Excel · tüm kalemler ve toplamlar',
      run: async () => {
        const items = await computePayrollForMonth({ db, orgId: orgId!, year, month });
        const m = await import('../../export/excel');
        await m.shareBordroExcel(items, year, month);
      },
    },
    {
      id: 'borc-pdf',
      title: 'Avans / Borç Dökümü',
      sub: 'PDF · verilen, ödenen, kalan',
      run: () => {
        const rows = activeEmployees
          .map((emp) => {
            const empDebts = debts.filter((d) => d.employee_id === emp.id);
            const given = empDebts.reduce((s, d) => s + d.amount, 0);
            const paid = empDebts.reduce(
              (s, d) => s + payments.filter((p) => p.debt_id === d.id).reduce((x, p) => x + p.amount, 0),
              0
            );
            return { name: emp.full_name, given, paid, remaining: Math.max(0, given - paid) };
          })
          .filter((r) => r.given > 0);
        return import('../../export/pdf').then((m) => m.shareBorcPdf({ name: org?.name ?? 'Firma' }, rows));
      },
    },
    {
      id: 'borc-excel',
      title: 'Avans / Borç Dökümü',
      sub: 'Excel',
      run: () => {
        const rows = activeEmployees.flatMap((emp) =>
          debts
            .filter((d) => d.employee_id === emp.id)
            .map((d) => {
              const paid = payments.filter((p) => p.debt_id === d.id).reduce((s, p) => s + p.amount, 0);
              return {
                name: emp.full_name,
                type: d.type === 'avans' ? 'Avans' : d.type === 'borc' ? 'Borç' : 'Diğer',
                given: d.amount,
                paid,
                remaining: Math.max(0, d.amount - paid),
                date: formatTarihKisa(d.given_at),
              };
            })
        );
        return import('../../export/excel').then((m) => m.shareBorcExcel(rows));
      },
    },
    {
      id: 'mesai-excel',
      title: 'Mesai Raporu',
      sub: `Excel · ${ayBasligi} saat ve tutar`,
      run: async () => {
        const items = await computePayrollForMonth({ db, orgId: orgId!, year, month });
        const rows = items
          .filter((i) => i.breakdown.overtimeHours > 0)
          .map((i) => ({ name: i.employee_name, hours: i.breakdown.overtimeHours, pay: i.overtime_pay }));
        const m = await import('../../export/excel');
        await m.shareMesaiExcel(rows, ayBasligi);
      },
    },
    {
      id: 'devamsizlik-pdf',
      title: 'Devamsızlık Analizi',
      sub: `PDF · ${ayBasligi}`,
      run: () => {
        const rows = activeEmployees
          .map((emp) => {
            const att = monthInfo.attendance.filter((a) => a.employee_id === emp.id);
            return {
              name: emp.full_name,
              absent: att.filter((a) => a.status === 'gelmedi' || a.status === 'ucretsiz_izin').length,
              late: att.filter((a) => a.status === 'gec_geldi').length,
              early: att.filter((a) => a.status === 'erken_cikti').length,
            };
          })
          .filter((r) => r.absent + r.late + r.early > 0)
          .sort((a, b) => b.absent - a.absent);
        return import('../../export/pdf').then((m) => m.shareDevamsizlikPdf({ name: org?.name ?? 'Firma' }, rows, ayBasligi));
      },
    },
    {
      id: 'izin-excel',
      title: 'Yıllık İzin Durumu',
      sub: 'Excel · hak, kullanılan, kalan',
      run: () => {
        const rows = employees.map((emp) => {
          const used = db.attendance.filter((a) => a.employee_id === emp.id && a.status === 'yillik_izin').length;
          const st = leaveStatus(emp, db.leave_adjustments.filter((l) => l.employee_id === emp.id), used, todayISO());
          return { name: emp.full_name, earned: st.earned + st.adjustment, used, remaining: st.remaining };
        });
        return import('../../export/excel').then((m) => m.shareIzinExcel(rows));
      },
    },
    {
      id: 'personel-excel',
      title: 'Personel Listesi',
      sub: 'Excel · iletişim, departman, giriş',
      run: () => {
        const names: Record<string, string> = {};
        for (const d of departments) names[d.id] = d.name;
        return import('../../export/excel').then((m) => m.sharePersonelExcel(employees, names));
      },
    },
    {
      id: 'yedek-excel',
      title: 'Tüm Veri Yedeği',
      sub: 'Excel · sayfa sayfa (insan okuması)',
      run: () => import('../../export/excel').then((m) => m.shareFullBackupExcel(db)),
    },
    {
      id: 'yedek-json',
      title: 'Tüm Veri Yedeği',
      sub: 'JSON · geri yüklenebilir (önerilen)',
      run: () => import('../../export/excel').then((m) => m.shareFullBackupJson(db)),
    },
  ];

  return (
    <Screen>
      <Header title="Raporlar" back compact subtitle="PDF · Excel · paylaş" />
      <View style={{ marginTop: 12 }}>
        <SegmentedControl
          options={[-2, -1, 0].map((off) => {
            const d = new Date(now.getFullYear(), now.getMonth() + off + 1, 1);
            return { value: `${d.getFullYear()}-${d.getMonth() + 1}`, label: `${ayAdi(d.getMonth() + 1)}` };
          })}
          value={`${year}-${month}`}
          onChange={(v) => {
            const [y, m] = v.split('-').map(Number);
            setYear(y);
            setMonth(m);
          }}
        />
        <Text style={[type.small, { color: c.textMuted, marginTop: 8, marginBottom: 4 }]}>
          {ayBasligi} · {monthInfo.plans.totalWorkdays} iş günü
        </Text>
      </View>

      {/* Üretim & Parti Özeti Kartı */}
      <Card
        onPress={() => router.push('/uretim' as never)}
        style={{ marginTop: 10, backgroundColor: c.surfaceContainerLow }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: c.tertiarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Layers size={20} color={c.tertiary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>
                  Üretim / Parti Takibi
                </Text>
                <Badge
                  label={`${productionStats.totalQty.toLocaleString('tr-TR')} adet`}
                  tone={productionStats.totalQty > 0 ? 'accent' : 'neutral'}
                />
              </View>
              <Text style={[type.small, { color: c.textMuted, marginTop: 2 }]}>
                {productionStats.totalQty > 0
                  ? `${ayBasligi}: ${productionStats.modelCount} farklı model · ${productionStats.batchCount} parti`
                  : `${ayBasligi} döneminde kayıtlı parti yok`}
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={c.textMuted} />
        </View>
      </Card>

      <SectionHeader title="RAPORLAR" />
      <View style={{ gap: 10 }}>
        {reportDefs.map((r, i) => (
          <Card
            key={`${r.id}-${i}`}
            onPress={() => {
              if (!busy) run(r.id, r.run);
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]}>{r.title}</Text>
                <Text style={[type.small, { color: c.textMuted }]}>{r.sub}</Text>
              </View>
              {busy === r.id ? <ActivityIndicator color={c.primary} /> : null}
            </View>
          </Card>
        ))}
      </View>

      <SectionHeader title="YEDEKTEN GERİ YÜKLEME" />
      <Card>
        <Text style={[type.small, { color: c.textSecondary }]}>
          JSON yedeğinizi Ayarlar → Hesap → Yedekten Geri Yükle adımıyla geri yükleyebilirsiniz. Geri yükleme mevcut
          veriyi yedek içeriğiyle değiştirir.
        </Text>
      </Card>
      <View style={{ height: 30 }} />
    </Screen>
  );
}
