import React, { useMemo } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flag,
  SlidersHorizontal,
  UserCheck,
  Wallet,
  Banknote,
} from 'lucide-react-native';
import { AtelierLogo, Card, Screen, Skeleton } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';
import {
  useDayAttendance,
  useDebts,
  useDebtPayments,
  useEmployees,
  useEvents,
  useMonthAttendance,
  useOrg,
  useSettings,
  useAllSalaries,
} from '../../data/hooks';
import { getDayPlan, addDaysISO, todayISO } from '../../domain/schedule';
import { calculateDebtBalance } from '../../domain/debts';
import { formatMoneyShort, formatTarih } from '../../utils/format';
import { useDataStore } from '../../data/store';
import { QuickActionsSheet } from '../../features/QuickActions';
import { hapticLight, hapticMedium } from '../../utils/haptics';

/** Bugün paneli: yoklama özeti, haftalık grafik ve yaklaşan günler */
export default function Bugun() {
  const { c, type, statusColor } = useTheme();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const org = useOrg();
  const settings = useSettings();
  const employees = useEmployees({ active: true });
  const allSalaries = useAllSalaries();
  const day = todayISO();
  const { byEmployee, confirmed } = useDayAttendance(day);
  const events = useEvents();
  const debts = useDebts();
  const payments = useDebtPayments();
  const monthAtt = useMonthAttendance(Number(day.slice(0, 4)), Number(day.slice(5, 7)));
  const allAttendance = useDataStore((s) => s.db.attendance);
  const scheduleDays = useDataStore((s) => s.db.schedule_days);
  const syncing = useDataStore((s) => !s.loaded);
  const [quickOpen, setQuickOpen] = React.useState(false);

  const plan = useMemo(() => getDayPlan(day, scheduleDays, events), [day, scheduleDays, events]);

  // Sayısal yoklama ve operasyon istatistikleri
  const stats = useMemo(() => {
    const workdayEmployees = employees.filter(
      (e) => plan.isWorkday && (!e.end_date || e.end_date >= day) && e.start_date <= day
    );

    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let report = 0;

    for (const e of workdayEmployees) {
      const rec = byEmployee.get(e.id);
      if (!rec || rec.status === 'geldi') {
        present++;
      } else if (rec.status === 'gec_geldi') {
        present++;
        late++;
      } else if (rec.status === 'erken_cikti' || rec.status === 'yarim_gun') {
        present++;
      } else if (rec.status === 'gelmedi') {
        absent++;
      } else if (rec.status === 'ucretsiz_izin') {
        absent++;
        leave++;
      } else if (rec.status === 'yillik_izin' || rec.status === 'mazeret_izni') {
        leave++;
      } else if (rec.status === 'rapor') {
        report++;
      }
    }

    const ym = day.slice(0, 7);
    const openDebt = debts
      .map((d) => calculateDebtBalance(d, payments, ym))
      .filter((b) => !b.isFullyPaid)
      .reduce((s, b) => s + b.remaining, 0);

    const monthAbsence = monthAtt.filter((a) => a.status === 'gelmedi' || a.status === 'ucretsiz_izin').length;

    const [yStr, mStr] = day.split('-');
    const yNum = Number(yStr);
    const mNum = Number(mStr);
    const lastDayOfMonth = new Date(Date.UTC(yNum, mNum, 0)).getUTCDate();
    const monthEnd = `${yStr}-${mStr}-${String(lastDayOfMonth).padStart(2, '0')}`;

    // Tahmini aylık net maaş toplamı: çalışan başına o ay geçerli tek maaş
    const estimatedPayroll = employees.reduce((sum, emp) => {
      const empSalaries = allSalaries.filter((s) => s.employee_id === emp.id);
      if (empSalaries.length === 0) return sum;
      const sorted = [...empSalaries].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
      const applicable = sorted.filter((s) => s.effective_from <= monthEnd);
      const chosen = applicable.length > 0 ? applicable[applicable.length - 1] : sorted[0];
      return sum + (chosen?.amount ?? 0);
    }, 0);

    const total = workdayEmployees.length || employees.length || 1;
    const percent = total > 0 ? Math.min(100, Math.round((present / total) * 100)) : 0;

    return {
      workdayEmployees,
      present,
      absent,
      late,
      leave,
      report,
      openDebt,
      monthAbsence,
      estimatedPayroll,
      total,
      percent,
    };
  }, [employees, byEmployee, debts, payments, monthAtt, day, plan.isWorkday, allSalaries]);

  const currentDayOfWeek = useMemo(() => {
    const [y, m, d] = day.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return (dt.getDay() + 6) % 7; // 0: Pzt, 6: Paz
  }, [day]);

  // Haftalık devam dağılımı (Pzt - Paz)
  const weekStats = useMemo(() => {
    const dayLabels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

    return dayLabels.map((lbl, idx) => {
      const diff = idx - currentDayOfWeek;
      const targetDate = addDaysISO(day, diff);
      const isTargetToday = idx === currentDayOfWeek;
      const isFuture = diff > 0;

      if (isFuture) {
        return { label: lbl, percent: 0, isToday: false, isWorkday: idx < 6, isFuture: true };
      }

      const p = getDayPlan(targetDate, scheduleDays, events);
      const activeAtDate = employees.filter((e) => e.start_date <= targetDate && (!e.end_date || e.end_date >= targetDate));
      if (!p.isWorkday || activeAtDate.length === 0) {
        return { label: lbl, percent: 0, isToday: isTargetToday, isWorkday: false, isFuture: false };
      }

      const came = activeAtDate.filter((e) => {
        const rec = allAttendance.find((a) => a.day === targetDate && a.employee_id === e.id);
        return !rec || rec.status === 'geldi' || ['gec_geldi', 'erken_cikti', 'yarim_gun'].includes(rec.status);
      }).length;

      const pct = Math.round((came / activeAtDate.length) * 100);
      return { label: lbl, percent: pct, isToday: isTargetToday, isWorkday: true, isFuture: false };
    });
  }, [day, employees, events, currentDayOfWeek, scheduleDays, allAttendance]);

  // Son 30 günün ortalama katılım oranı
  const monthlyAverage = useMemo(() => {
    const validPcts: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = addDaysISO(day, -i);
      const p = getDayPlan(d, scheduleDays, events);
      if (!p.isWorkday) continue;
      const emps = employees.filter((e) => e.start_date <= d && (!e.end_date || e.end_date >= d));
      if (emps.length === 0) continue;
      const came = emps.filter((e) => {
        const rec = allAttendance.find((a) => a.day === d && a.employee_id === e.id);
        return !rec || rec.status === 'geldi' || ['gec_geldi', 'erken_cikti', 'yarim_gun'].includes(rec.status);
      }).length;
      validPcts.push(Math.round((came / emps.length) * 100));
    }
    if (validPcts.length === 0) return null;
    return Math.round(validPcts.reduce((a, b) => a + b, 0) / validPcts.length);
  }, [day, employees, events, scheduleDays, allAttendance]);

  // Yaklaşan önemli günler (Resmi tatiller, ek çalışma, maaş günü)
  const upcoming = useMemo(() => {
    const items: { title: string; subtitle: string; tag: string; type: 'flag' | 'overtime' | 'pay' }[] = [];
    const soon = events
      .filter((e) => e.date >= day && e.date <= addDaysISO(day, 35))
      .sort((a, b) => a.date.localeCompare(b.date));

    const toUtcDayNumber = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      return Math.round(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24));
    };

    for (const e of soon.slice(0, 3)) {
      const diffDays = toUtcDayNumber(e.date) - toUtcDayNumber(day);
      const tag = diffDays === 0 ? 'Bugün' : diffDays === 1 ? 'Yarın' : `${diffDays} gün kaldı`;
      if (e.type === 'resmi_tatil') {
        items.push({
          title: e.title,
          subtitle: `${formatTarih(e.date, { yil: false })} · Resmî tatil`,
          tag,
          type: 'flag',
        });
      } else if (e.type === 'ek_calisma') {
        items.push({
          title: e.title || 'Ek Çalışma Vardiyası',
          subtitle: `${formatTarih(e.date, { yil: false })} · Atölye ek mesai`,
          tag: diffDays <= 7 ? 'Bu Hafta' : tag,
          type: 'overtime',
        });
      }
    }

    // Maaş günü hesaplama
    const todayDay = Number(day.slice(8));
    const payday = settings.paydayOfMonth || 5;
    let paydayDate: string;
    if (todayDay <= payday) {
      paydayDate = `${day.slice(0, 7)}-${String(payday).padStart(2, '0')}`;
    } else {
      paydayDate = `${addDaysISO(`${day.slice(0, 7)}-28`, 7).slice(0, 7)}-${String(payday).padStart(2, '0')}`;
    }
    const payDiff = toUtcDayNumber(paydayDate) - toUtcDayNumber(day);
    items.push({
      title: 'Maaş & Parça Başı Hakediş',
      subtitle: `${formatTarih(paydayDate, { yil: false })} · Aylık bordro dağıtımı`,
      tag: payDiff === 0 ? 'Bugün' : `${payDiff} gün`,
      type: 'pay',
    });

    return items;
  }, [events, day, settings.paydayOfMonth]);

  if (syncing) {
    return (
      <Screen bottomInset={100}>
        <View style={{ height: 20 }} />
        <Skeleton height={32} width={180} />
        <View style={{ height: 16 }} />
        <Skeleton height={180} />
        <View style={{ height: 16 }} />
        <Skeleton height={120} />
      </Screen>
    );
  }

  const formatMinutes = (m: number | null, fallback: string) => {
    if (m === null) return fallback;
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };
  const timeRange = `${formatMinutes(plan.startMinutes, '08:00')}–${formatMinutes(plan.endMinutes, '18:00')}`;

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 11 ? 'Günaydın' : greetingHour < 18 ? 'İyi günler' : greetingHour < 22 ? 'İyi akşamlar' : 'İyi geceler';

  const monthName = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, 1).toLocaleDateString(
    'tr-TR',
    { month: 'long' }
  );

  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(insets.top, statusBarHeight, Platform.OS === 'ios' ? 44 : 28);

  return (
    <Screen
      bottomInset={110}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => undefined} tintColor={c.primary} />}
    >
      {/* 1. ÜST BAR: STITCH LOGO & TEKSTİL ERP + BİLDİRİMLER & PROFİL */}
      <View
        style={[
          styles.topHeader,
          {
            paddingTop: topInset + 8,
          },
        ]}
      >
        <View style={styles.brandRow}>
          <AtelierLogo size={36} />
          <View style={styles.brandTextCol}>
            {org?.name ? (
              <Text style={[type.labelSm, styles.brandSubtitle, { color: c.primary }]}>
                {org.name.toLocaleUpperCase('tr-TR')}
              </Text>
            ) : null}
            <Text style={[type.titleMd, styles.brandTitle, { color: c.text }]}>Bugün</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            hitSlop={10}
            onPress={() => {
              hapticLight();
              router.push('/ayarlar/bildirimler');
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: c.surfaceContainerLow,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            accessibilityLabel="Bildirimler"
            accessibilityRole="button"
          >
            <Bell size={20} color={c.text} />
          </Pressable>

          <Link href="/ayarlar" asChild>
            <Pressable
              hitSlop={10}
              onPress={() => hapticLight()}
              style={({ pressed }) => [
                styles.profileAvatar,
                {
                  backgroundColor: c.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              accessibilityLabel="Ayarlar ve Profil"
              accessibilityRole="button"
            >
              <Text style={[styles.avatarInitials, { color: c.onPrimary }]}>
                {(auth.name || org?.name || 'A').charAt(0).toLocaleUpperCase('tr')}
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {/* 2. SELAMLAMA */}
      <View style={styles.greetingSection}>
        <View style={{ flex: 1 }}>
          <Text style={[type.headlineSm, { color: c.text, fontWeight: '700' }]} numberOfLines={1}>
            {greeting}
            {auth.name ? `, ${auth.name.split(' ')[0]}` : ''}
          </Text>
          <View style={styles.dateRow}>
            <Text style={[type.bodySm, { color: c.textMuted }]}>
              {formatTarih(day, { gunAdi: true, yil: false })}
            </Text>
            <View style={[styles.workdayBadge, { backgroundColor: c.primarySoft }]}>
              <Text style={[type.labelSm, { color: c.primary, fontWeight: '600' }]}>
                {plan.kind === 'ek_calisma'
                  ? 'Ek çalışma'
                  : plan.isWorkday
                  ? 'İş günü'
                  : 'Tatil'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 3. HERO KART: BUGÜNÜN YOKLAMASI */}
      <Card padded style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.titleMd, { color: c.text, fontWeight: '700' }]}>Bugünün Yoklaması</Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginTop: 2 }]}>
              {stats.total} kişi · {timeRange}
            </Text>
          </View>

          <View style={[styles.heroIconWrap, { backgroundColor: c.primarySoft }]}>
            <UserCheck size={20} color={c.primary} />
          </View>
        </View>

        {/* Büyük Canlı İlerleme Sayacı */}
        <View style={styles.heroMetricRow}>
          <View style={styles.heroNumberGroup}>
            <Text style={[type.numericHero, { color: c.text }]}>{stats.present}</Text>
            <Text style={[type.titleMd, { color: c.textMuted }]}>/ {stats.total} işte</Text>
          </View>
          <View style={[styles.readyBadge, { backgroundColor: c.primarySoft }]}>
            <Text style={[type.labelMd, { color: c.primary, fontWeight: '700' }]}>
              %{stats.percent} Hazır
            </Text>
          </View>
        </View>

        {/* İlerleme Çubuğu */}
        <View style={[styles.progressTrack, { backgroundColor: c.surfaceContainerHigh }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.max(stats.percent > 0 ? 4 : 0, stats.percent)}%`,
                backgroundColor: c.primary,
              },
            ]}
          />
        </View>

        {/* Durum Kırılımı (Yatay Kaydırılabilir) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.breakdownRow}
        >
          {(
            [
              ['gelmedi', `${stats.absent} Gelmedi`],
              ['gec_geldi', `${stats.late} Geç`],
              ['yillik_izin', `${stats.leave} İzin`],
              ['rapor', `${stats.report} Rapor`],
              ['geldi', `${stats.present} Geldi`],
            ] as const
          ).map(([status, label]) => {
            const col = statusColor(status);
            return (
              <View key={status} style={[styles.statusChip, { backgroundColor: col.soft }]}>
                <View style={[styles.chipDot, { backgroundColor: col.main }]} />
                <Text style={[type.labelSm, { color: col.main }]}>{label}</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Birincil Aksiyon Butonu */}
        <Pressable
          onPress={() => {
            hapticMedium();
            router.push('/(tabs)/puantaj');
          }}
          style={({ pressed }) => [
            styles.heroActionBtn,
            {
              backgroundColor: c.primary,
              opacity: pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Yoklamayı Tamamla ve Puantaj"
        >
          <Text style={[styles.heroActionBtnText, { color: c.onPrimary }]}>
            {confirmed ? 'Puantaj Kayıtlarını İncele' : 'Yoklamayı Tamamla & Puantaj'}
          </Text>
          <ArrowRight size={18} color={c.onPrimary} strokeWidth={2.4} />
        </Pressable>
      </Card>

      {/* 4. 2x2 METRİK IZGARASI */}
      <View style={styles.bentoGrid}>
        {/* Bento 1: Katılım */}
        <Pressable
          onPress={() => {
            hapticLight();
            router.push('/(tabs)/puantaj');
          }}
          style={({ pressed }) => [
            styles.bentoItem,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <View style={styles.bentoTop}>
            <View style={[styles.bentoIconBox, { backgroundColor: c.primarySoft }]}>
              <CheckCircle2 size={18} color={c.primary} />
            </View>
            <Text style={[type.labelSm, { color: c.primary, fontWeight: '700' }]}>
              %{stats.percent}
            </Text>
          </View>
          <View style={styles.bentoBottom}>
            <Text style={[type.numericCard, { color: c.text }]}>
              {stats.present} / {stats.total}
            </Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginTop: 2 }]} numberOfLines={1}>
              Bugün atölyede
            </Text>
          </View>
        </Pressable>

        {/* Bento 2: Avans */}
        <Pressable
          onPress={() => {
            hapticLight();
            router.push('/(tabs)/para');
          }}
          style={({ pressed }) => [
            styles.bentoItem,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <View style={styles.bentoTop}>
            <View style={[styles.bentoIconBox, { backgroundColor: c.primarySoft }]}>
              <Wallet size={18} color={c.primary} />
            </View>
            <Text style={[type.labelSm, { color: c.textMuted }]}>{monthName}</Text>
          </View>
          <View style={styles.bentoBottom}>
            <Text style={[type.numericCard, { color: c.text }]}>
              {formatMoneyShort(stats.openDebt)}
            </Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginTop: 2 }]} numberOfLines={1}>
              Açık avans bakiyesi
            </Text>
          </View>
        </Pressable>

        {/* Bento 3: Devamsızlık */}
        <Pressable
          onPress={() => {
            hapticLight();
            router.push('/(tabs)/puantaj');
          }}
          style={({ pressed }) => [
            styles.bentoItem,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <View style={styles.bentoTop}>
            <View style={[styles.bentoIconBox, { backgroundColor: c.warningSoft }]}>
              <AlertCircle size={18} color={c.warning} />
            </View>
            <Text style={[type.labelSm, { color: c.textMuted }]}>
              {monthName}
            </Text>
          </View>
          <View style={styles.bentoBottom}>
            <Text style={[type.numericCard, { color: c.text }]}>{stats.monthAbsence} gün</Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginTop: 2 }]} numberOfLines={1}>
              Bu ay devamsızlık
            </Text>
          </View>
        </Pressable>

        {/* Bento 4: Tahmini Net Maaş / Bordro */}
        <Pressable
          onPress={() => {
            hapticLight();
            router.push(`/bordro/${day.slice(0, 4)}/${Number(day.slice(5, 7))}`);
          }}
          style={({ pressed }) => [
            styles.bentoItem,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <View style={styles.bentoTop}>
            <View style={[styles.bentoIconBox, { backgroundColor: c.primarySoft }]}>
              <Banknote size={18} color={c.primary} />
            </View>
            <Text style={[type.labelSm, { color: c.textMuted, fontWeight: '600' }]}>Bordro</Text>
          </View>
          <View style={styles.bentoBottom}>
            <Text style={[type.numericCard, { color: c.text }]}>
              {formatMoneyShort(stats.estimatedPayroll)}
            </Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginTop: 2 }]} numberOfLines={1}>
              Tahmini net maaş
            </Text>
          </View>
        </Pressable>
      </View>

      {/* 5. HAFTALIK DEVAM GRAFİĞİ */}
      <Card padded style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[type.titleMd, { color: c.text, fontWeight: '700' }]}>
              Haftalık Devam
            </Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginTop: 2 }]}>
              {monthlyAverage !== null ? `Son 30 gün ortalaması %${monthlyAverage}` : 'Bu ay henüz yoklama yok'}
            </Text>
          </View>
          {monthlyAverage !== null ? (
            <View style={[styles.chartRateTag, { backgroundColor: c.primarySoft }]}>
              <Text style={[type.titleMd, { color: c.primary, fontWeight: '700' }]}>
                %{monthlyAverage}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Minimal Hafta Günü Sütun Grafiği */}
        <View style={styles.weekChartContainer}>
          {weekStats.map((w) => {
            const barHeight = Math.max(2, Math.round((w.percent / 100) * 64));
            const barBg = w.isToday
              ? c.primary
              : w.isWorkday
              ? c.primaryFixedDim
              : c.surfaceContainerHighest;

            return (
              <View key={w.label} style={styles.weekCol}>
                <View style={styles.weekBarTrack}>
                  <View
                    style={[
                      styles.weekBarFill,
                      {
                        height: barHeight,
                        backgroundColor: barBg,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    type.labelSm,
                    {
                      color: w.isToday ? c.primary : c.textMuted,
                      fontWeight: w.isToday ? '700' : '500',
                      marginTop: 6,
                    },
                  ]}
                >
                  {w.isToday ? 'Bugün' : w.label}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      {/* 6. YAKLAŞAN ÖNEMLİ GÜNLER KARTI */}
      <Card padded style={styles.upcomingCard}>
        <View style={styles.upcomingHeader}>
          <Text style={[type.labelSm, { color: c.textMuted, letterSpacing: 0.8 }]}>
            YAKLAŞAN ÖNEMLİ GÜNLER
          </Text>
          <Pressable
            onPress={() => {
              hapticLight();
              router.push('/ayarlar/takvim');
            }}
          >
            <Text style={[type.labelSm, { color: c.primary, fontWeight: '600' }]}>Tümünü Gör</Text>
          </Pressable>
        </View>

        <View style={styles.upcomingList}>
          {upcoming.map((item, idx) => {
            const tone =
              item.type === 'flag'
                ? { bg: c.dangerSoft, fg: c.danger }
                : item.type === 'overtime'
                ? { bg: c.warningSoft, fg: c.warning }
                : { bg: c.primarySoft, fg: c.primary };
            return (
              <View
                key={`${item.title}-${idx}`}
                style={[styles.upcomingRow, { backgroundColor: c.surfaceContainerLow }]}
              >
                <View style={styles.upcomingLeft}>
                  <View style={[styles.upcomingIconBox, { backgroundColor: tone.bg }]}>
                    {item.type === 'flag' ? (
                      <Flag size={18} color={tone.fg} />
                    ) : item.type === 'overtime' ? (
                      <Clock size={18} color={tone.fg} />
                    ) : (
                      <Calendar size={18} color={tone.fg} />
                    )}
                  </View>
                  <View style={styles.upcomingTextCol}>
                    <Text style={[type.titleMd, { color: c.text, fontWeight: '600' }]}>
                      {item.title}
                    </Text>
                    <Text style={[type.bodySm, { color: c.textMuted, marginTop: 1 }]}>
                      {item.subtitle}
                    </Text>
                  </View>
                </View>

                <View style={[styles.upcomingTag, { backgroundColor: tone.bg }]}>
                  <Text style={[type.labelSm, { color: tone.fg, fontWeight: '600' }]}>
                    {item.tag}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {/* 6. HIZLI İŞLEM KAROSU */}
      <Pressable
        onPress={() => {
          hapticMedium();
          setQuickOpen(true);
        }}
        style={({ pressed }) => [
          styles.actionTile,
          {
            backgroundColor: c.surfaceContainer,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <View style={styles.actionTileLeft}>
          <View style={[styles.actionTileIconWrap, { backgroundColor: c.surface }]}>
            <SlidersHorizontal size={20} color={c.primary} />
          </View>
          <View style={styles.actionTileCol}>
            <Text style={[type.titleMd, { color: c.text, fontWeight: '700' }]}>
              Hızlı İşlemler
            </Text>
            <Text style={[type.bodySm, { color: c.textMuted, marginTop: 1 }]}>
              Avans ver, ek çalışma planla veya toplu yoklama yap
            </Text>
          </View>
        </View>
        <ChevronRight size={20} color={c.textMuted} />
      </Pressable>

      <QuickActionsSheet visible={quickOpen} onClose={() => setQuickOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandTextCol: {
    flexDirection: 'column',
  },
  brandSubtitle: {
    letterSpacing: 0.8,
    lineHeight: 12,
  },
  brandTitle: {
    fontWeight: '700',
    lineHeight: 22,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  greetingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 16,
    gap: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  workdayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  heroCard: {
    padding: 18,
    borderRadius: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMetricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  heroNumberGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  readyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingBottom: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroActionBtn: {
    marginTop: 18,
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#3B5BDB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  heroActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  bentoItem: {
    width: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    minHeight: 112,
    justifyContent: 'space-between',
  },
  bentoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bentoIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoBottom: {
    marginTop: 8,
  },
  chartCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 18,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartRateTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  weekChartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 94,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  weekCol: {
    alignItems: 'center',
    flex: 1,
  },
  weekBarTrack: {
    height: 64,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  weekBarFill: {
    width: 14,
    borderRadius: 4,
  },
  upcomingCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 18,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  upcomingList: {
    gap: 10,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
  },
  upcomingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  upcomingIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingTextCol: {
    flex: 1,
  },
  upcomingTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  actionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
  },
  actionTileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  actionTileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  actionTileCol: {
    flex: 1,
  },
});
