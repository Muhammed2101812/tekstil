import { Debt, DebtPayment } from '../types';
import { round2 } from './wage';

/**
 * Avans & borç motoru (PLAN.md Bölüm 4.6 taksit kuralları, 6.6).
 * Taksit önerisi: tutar / taksit sayısı, kalan borcu aşmaz; tek seferde ise
 * kalanın tamamı; kesim start_month'den itibaren başlar; önce eski borçlar kapanır.
 */

export interface DebtBalance {
  debt: Debt;
  totalPaid: number;
  remaining: number;
  isFullyPaid: boolean;
  /** Bu ay için önerilen taksit (başlangıç ayı gelmemişse 0) */
  suggestedInstallment: number;
}

export function calculateDebtBalance(debt: Debt, payments: DebtPayment[], currentYearMonth: string): DebtBalance {
  const totalPaid = round2(payments.filter((p) => p.debt_id === debt.id).reduce((s, p) => s + p.amount, 0));
  const remaining = Math.max(0, round2(debt.amount - totalPaid));
  const isFullyPaid = remaining <= 0;

  if (isFullyPaid) {
    return { debt, totalPaid, remaining: 0, isFullyPaid: true, suggestedInstallment: 0 };
  }
  // Kesimler başlangıç ayından önce başlamaz
  if (currentYearMonth < debt.start_month) {
    return { debt, totalPaid, remaining, isFullyPaid: false, suggestedInstallment: 0 };
  }
  if (debt.installments <= 1) {
    return { debt, totalPaid, remaining, isFullyPaid: false, suggestedInstallment: remaining };
  }
  const standard = round2(debt.amount / debt.installments);
  return { debt, totalPaid, remaining, isFullyPaid: false, suggestedInstallment: Math.min(standard, remaining) };
}

/** Açık borçlar, eski veriliş tarihi önce gelecek şekilde sıralı */
export function openDebtBalances(debts: Debt[], payments: DebtPayment[], currentYearMonth: string): DebtBalance[] {
  return debts
    .map((d) => calculateDebtBalance(d, payments, currentYearMonth))
    .filter((b) => !b.isFullyPaid)
    .sort((a, b) => a.debt.given_at.localeCompare(b.debt.given_at));
}

export interface DebtAllocationResult {
  allocations: { debt_id: string; amount: number }[];
  suggestedTotal: number;
  allocatedTotal: number;
}

/**
 * Bu ay kesilecek taksitleri bütçeye göre dağıtır (önce eski borçlar).
 * `budget` sınırı: taksitler ara toplamı aşamaz → en yeni borçların taksidi
 * kısmen alınır ya da hiç alınmaz (negatif net engeli, PLAN 4.6).
 */
export function allocateDebtCut(
  debts: Debt[],
  payments: DebtPayment[],
  currentYearMonth: string,
  budget: number,
  opts: { allowAboveSuggested?: boolean } = {}
): DebtAllocationResult {
  const balances = openDebtBalances(debts, payments, currentYearMonth);
  const suggestedTotal = round2(balances.reduce((s, b) => s + b.suggestedInstallment, 0));
  let left = Math.max(0, round2(budget));
  const allocations: { debt_id: string; amount: number }[] = [];
  for (const b of balances) {
    if (left <= 0) break;
    const amount = round2(Math.min(b.suggestedInstallment, left));
    if (amount > 0) {
      allocations.push({ debt_id: b.debt.id, amount });
      left = round2(left - amount);
    }
  }
  if (opts.allowAboveSuggested && left > 0) {
    for (const b of balances) {
      if (left <= 0) break;
      const existing = allocations.find((a) => a.debt_id === b.debt.id);
      const alreadyAllocated = existing ? existing.amount : 0;
      const canTakeMore = round2(b.remaining - alreadyAllocated);
      if (canTakeMore > 0) {
        const extra = round2(Math.min(canTakeMore, left));
        if (extra > 0) {
          if (existing) {
            existing.amount = round2(existing.amount + extra);
          } else {
            allocations.push({ debt_id: b.debt.id, amount: extra });
          }
          left = round2(left - extra);
        }
      }
    }
  }
  const allocatedTotal = round2(allocations.reduce((s, a) => s + a.amount, 0));
  return { allocations, suggestedTotal, allocatedTotal };
}

/** Çalışanın toplam açık borcu */
export function totalOpenDebt(debts: Debt[], payments: DebtPayment[], currentYearMonth: string): number {
  return round2(openDebtBalances(debts, payments, currentYearMonth).reduce((s, b) => s + b.remaining, 0));
}
