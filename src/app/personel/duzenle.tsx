import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Avatar, Button, Card, Chip, DateField, Header, MoneyField, Screen, TextField, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useDepartments, useEmployee, useSalaries } from '../../data/hooks';
import { addEmployee, updateEmployee } from '../../data/repo';
import { todayISO } from '../../domain/schedule';
import { gecerliIban, gecerliTckn } from '../../utils/format';
import { z } from 'zod';

const schema = z.object({
  full_name: z.string().trim().min(3, 'Ad Soyad en az 3 harf olmalı.'),
  salary: z.number().positive('Net maaş sıfırdan büyük olmalı.'),
  start_date: z.string().min(8, 'İşe giriş tarihi gerekli.'),
  tc_no: z
    .string()
    .refine((v) => v === '' || gecerliTckn(v), 'TC Kimlik No geçersiz (11 hane, algoritmik).'),
  iban: z.string().refine((v) => v === '' || gecerliIban(v), 'IBAN geçersiz (TR + 24 hane).'),
  phone: z.string().refine((v) => v === '' || /^0?5\d{9}$/.test(v.replace(/\D/g, '')), 'Telefon 05xx xxx xx xx biçiminde olmalı.'),
});

/** Çalışan Ekle / Düzenle (PLAN 6.5): zorunlu alanlar Ad, Net Maaş, İşe Giriş */
export default function CalisanDuzenle() {
  const { type, c } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = !!params.id;
  const employee = useEmployee(params.id);
  const salaries = useSalaries(params.id);
  const departments = useDepartments();

  const [fullName, setFullName] = useState(employee?.full_name ?? '');
  const [salary, setSalary] = useState(salaries[salaries.length - 1]?.amount ?? 0);
  const [startDate, setStartDate] = useState(employee?.start_date ?? todayISO());
  const [departmentId, setDepartmentId] = useState<string | null>(employee?.department_id ?? null);
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [tcNo, setTcNo] = useState(employee?.tc_no ?? '');
  const [iban, setIban] = useState(employee?.iban ?? '');
  const [birthDate, setBirthDate] = useState(employee?.birth_date ?? null);
  const [address, setAddress] = useState(employee?.address ?? '');
  const [emergency, setEmergency] = useState(employee?.emergency_contact ?? '');
  const [notes, setNotes] = useState(employee?.notes ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(employee?.photo_url ?? null);
  const [showExtra, setShowExtra] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Veri geç gelirse (düzenleme ekranı ilk açılışta boş olabilir) formu doldur.
  // React'in belgelenmiş deseni: props değişince render sırasında state'i sıfırla.
  if (employee && hydratedFor !== employee.id) {
    setHydratedFor(employee.id);
    setFullName(employee.full_name);
    setStartDate(employee.start_date);
    setDepartmentId(employee.department_id);
    setPhone(employee.phone ?? '');
    setTcNo(employee.tc_no ?? '');
    setIban(employee.iban ?? '');
    setBirthDate(employee.birth_date);
    setAddress(employee.address ?? '');
    setEmergency(employee.emergency_contact ?? '');
    setNotes(employee.notes ?? '');
    setPhotoUrl(employee.photo_url);
    if (salaries.length > 0) setSalary(salaries[salaries.length - 1].amount);
  }

  /** Seçilen/çekilen fotoğrafı önbellekten kalıcı klasöre kopyalar */
  const persistPhoto = async (uri: string): Promise<string> => {
    if (Platform.OS === 'web') return uri;
    try {
      const src = new File(uri);
      const dest = new File(Paths.document, `foto-${Date.now()}.jpg`);
      const b64 = await src.base64();
      dest.create({ overwrite: true });
      dest.write(b64, { encoding: 'base64' });
      return dest.uri;
    } catch {
      return uri;
    }
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({ message: 'Galeri erişim izni verilmedi', tone: 'warning' });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets?.[0]) setPhotoUrl(await persistPhoto(res.assets[0].uri));
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast({ message: 'Kamera erişim izni verilmedi', tone: 'warning' });
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets?.[0]) setPhotoUrl(await persistPhoto(res.assets[0].uri));
  };

  const save = async () => {
    const parsed = schema.safeParse({
      full_name: fullName,
      salary,
      start_date: startDate,
      tc_no: tcNo.trim(),
      iban: iban.trim().replace(/\s/g, ''),
      phone: phone.trim(),
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[String(issue.path[0])] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    const v = parsed.data;
    try {
      if (editing && employee) {
        await updateEmployee({
          ...employee,
          full_name: v.full_name,
          department_id: departmentId,
          phone: v.phone || null,
          tc_no: v.tc_no || null,
          iban: v.iban || null,
          birth_date: birthDate,
          address: address || null,
          emergency_contact: emergency || null,
          notes: notes || null,
          start_date: startDate,
          photo_url: photoUrl,
        });
        // maaş değiştiyse zam olarak ekle
        const current = salaries[salaries.length - 1]?.amount ?? 0;
        if (Math.abs(current - salary) > 0.01) {
          const { addSalaryRaise } = await import('../../data/repo');
          await addSalaryRaise(employee.id, salary, todayISO(), 'Formdan güncellendi');
        }
      } else {
        await addEmployee({
          full_name: v.full_name,
          salary,
          start_date: startDate,
          department_id: departmentId,
          phone: v.phone || null,
          tc_no: v.tc_no || null,
          iban: v.iban || null,
          birth_date: birthDate,
          address: address || null,
          emergency_contact: emergency || null,
          notes: notes || null,
          photo_url: photoUrl,
        });
      }
      router.back();
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Kaydedilemedi', tone: 'warning' });
    }
  };

  return (
    <Screen keyboard>
      <Header title={editing ? 'Çalışanı Düzenle' : 'Çalışan Ekle'} back compact />
      <View style={{ marginTop: 12 }}>
        <TextField label="Ad Soyad *" value={fullName} onChangeText={setFullName} placeholder="Ayşe Yılmaz" error={errors.full_name} />
        <MoneyField label="Net Maaş (aylık) *" value={salary} onChange={setSalary} quickAmounts={[25000, 30000, 35000, 40000]} error={errors.salary} />
        <DateField label="İşe Giriş Tarihi *" value={startDate} onPick={setStartDate} error={errors.start_date} />

        <Text style={[type.small, { color: c.textSecondary, fontWeight: '600', marginBottom: 8 }]}>Departman</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <Chip label="Yok" selected={departmentId === null} onPress={() => setDepartmentId(null)} />
          {departments.map((d) => (
            <Chip key={d.id} label={d.name} selected={departmentId === d.id} onPress={() => setDepartmentId(d.id)} />
          ))}
        </View>

        <Card onPress={() => setShowExtra(!showExtra)} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[type.body, { color: c.text }]}>Ek bilgiler (isteğe bağlı)</Text>
            {showExtra ? (
              <ChevronUp size={18} color={c.textMuted} />
            ) : (
              <ChevronDown size={18} color={c.textMuted} />
            )}
          </View>
        </Card>

        {showExtra ? (
          <Card style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar name={fullName || 'Yeni Çalışan'} photoUrl={photoUrl} size={56} />
              <View style={{ flex: 1, gap: 8 }}>
                {photoUrl ? (
                  <Button
                    label="Fotoğrafı Kaldır"
                    variant="secondary"
                    size="md"
                    onPress={() => setPhotoUrl(null)}
                  />
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button
                      label="Galeriden Seç"
                      variant="secondary"
                      size="md"
                      onPress={pickPhoto}
                      full={false}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Kameradan Çek"
                      variant="secondary"
                      size="md"
                      onPress={takePhoto}
                      full={false}
                      style={{ flex: 1 }}
                    />
                  </View>
                )}
              </View>
            </View>
          </Card>
        ) : null}

        {showExtra ? (
          <>
            <TextField label="Telefon" value={phone} onChangeText={setPhone} placeholder="0532 123 45 67" keyboardType="phone-pad" error={errors.phone} />
            <TextField label="TC Kimlik No" value={tcNo} onChangeText={(t) => setTcNo(t.replace(/\D/g, '').slice(0, 11))} placeholder="12345678901" keyboardType="numeric" error={errors.tc_no} />
            <TextField label="IBAN" value={iban} onChangeText={(t) => setIban(t.toLocaleUpperCase('tr'))} placeholder="TR33 0006 1005 ..." autoCapitalize="none" error={errors.iban} />
            <DateField label="Doğum Tarihi" value={birthDate} onPick={(d) => setBirthDate(d)} hint="Yıllık izin yaş istisnası için" />
            <TextField label="Adres" value={address} onChangeText={setAddress} placeholder="Mahalle, sokak…" multiline />
            <TextField label="Acil Durum Kişisi" value={emergency} onChangeText={setEmergency} placeholder="Ad + telefon" />
            <TextField label="Notlar" value={notes} onChangeText={setNotes} placeholder="Örn. makine numarası" multiline />
          </>
        ) : null}

        <Button label={editing ? 'Kaydet' : 'Çalışanı Ekle'} onPress={save} />
        <View style={{ height: 20 }} />
      </View>
    </Screen>
  );
}
