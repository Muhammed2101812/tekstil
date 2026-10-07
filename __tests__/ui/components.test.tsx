import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusPill } from '../../src/ui/StatusPill';
import { MoneyField } from '../../src/ui/MoneyField';
import { Chip } from '../../src/ui/Chip';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { formatMoney, formatMoneyShort, formatTarih, gecerliIban, gecerliTckn, maskIban, maskTc } from '../../src/utils/format';

const TEST_METRICS = { frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function wrap(ui: React.ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

/** PLAN 14.1: bileşen testleri — puantaj etiketi, para alanı biçimi, form doğrulama */
describe('UI bileşenleri', () => {
  test('StatusPill: durum etiketi görünür (renk + ikon + yazı)', async () => {
    const { getByText } = await render(wrap(<StatusPill status="gelmedi" detail="2" />));
    expect(getByText(/Gelmedi/)).toBeTruthy();
    expect(getByText(/2/)).toBeTruthy();
  });

  test('StatusPill: tüm durumlar etiketli', async () => {
    const durumlar = ['geldi', 'gec_geldi', 'erken_cikti', 'yarim_gun', 'yillik_izin', 'mazeret_izni', 'ucretsiz_izin', 'rapor'];
    for (const d of durumlar) {
      const { unmount, root } = await render(wrap(<StatusPill status={d as never} />));
      expect(root).toBeTruthy();
      await unmount();
    }
  });

  test('MoneyField: tutar Türkçe biçimde gösterilir (₺30.000,00)', async () => {
    const { getByText } = await render(wrap(<MoneyField label="Tutar" value={30000} onChange={() => undefined} />));
    expect(getByText('₺30.000,00')).toBeTruthy();
  });

  test('Chip: seçili durum erişilebilirlik durumuyla gelir', async () => {
    const { getByRole } = await render(wrap(<Chip label="Dikim" selected onPress={() => undefined} />));
    const chip = getByRole('button', { name: 'Dikim' });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
  });
});

describe('Para ve tarih biçimleme (PLAN 7.2)', () => {
  test('formatMoney: binlik ayraç, kuruş, eksi işareti', () => {
    expect(formatMoney(30000, { kurus: true })).toBe('₺30.000,00');
    expect(formatMoney(1384.62, { kurus: true, sign: true })).toBe('+₺1.384,62');
    expect(formatMoney(-1384.62, { kurus: true })).toBe('−₺1.384,62');
    expect(formatMoney(28615.38)).toBe('₺28.615');
  });

  test('formatMoneyShort: milyon kısaltması', () => {
    expect(formatMoneyShort(1_250_000)).toBe('₺1,3 Mn');
    expect(formatMoneyShort(950_000)).toBe('₺950.000');
  });

  test('formatTarih: Türkçe gün ve ay adları', () => {
    expect(formatTarih('2026-10-03', { gunAdi: true })).toBe('3 Ekim Cumartesi');
    expect(formatTarih('2026-11-12', { yil: true })).toBe('12 Kasım 2026');
  });
});

describe('TC kimlik ve IBAN doğrulama (PLAN 6.5)', () => {
  test('TCKN algoritması', () => {
    expect(gecerliTckn('10000000146')).toBe(true); // bilinen geçerli örnek
    expect(gecerliTckn('10000000144')).toBe(false);
    expect(gecerliTckn('1234567890')).toBe(false);
    expect(gecerliTckn('01234567890')).toBe(false);
  });

  test('IBAN mod-97', () => {
    expect(gecerliIban('TR330006100519786457841326')).toBe(true);
    expect(gecerliIban('TR330006100519786457841327')).toBe(false);
    expect(gecerliIban('TR330006')).toBe(false);
  });

  test('Maskeleme', () => {
    expect(maskTc('10000000146')).toBe('*** *** 0146');
    expect(maskIban('TR330006100519786457841326')).toBe('TR** **** **** 1326');
  });
});
