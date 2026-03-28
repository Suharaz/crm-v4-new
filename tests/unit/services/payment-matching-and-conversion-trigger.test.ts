import { describe, it, expect } from 'vitest';

// Pure logic extracted từ PaymentMatchingService — không cần DB
// Kiểm tra matching logic và conversion trigger conditions

// ─── Matching logic helpers ───────────────────────────────────────────────────

interface Payment {
  id: bigint;
  status: 'PENDING' | 'VERIFIED';
  amount: number;
  transferContent: string | null;
}

interface BankTransaction {
  id: bigint;
  matchStatus: 'UNMATCHED' | 'AUTO_MATCHED' | 'MANUAL_MATCHED';
  amount: number;
  content: string;
}

/**
 * Kiểm tra một payment có khớp với một bank transaction hay không.
 * Điều kiện: amount bằng nhau VÀ transferContent là substring của content (case-insensitive).
 */
function isPaymentMatchingBankTx(payment: Payment, bankTx: BankTransaction): boolean {
  if (payment.status !== 'PENDING') return false;
  if (bankTx.matchStatus !== 'UNMATCHED') return false;
  if (!payment.transferContent) return false;
  if (payment.amount !== bankTx.amount) return false;
  return bankTx.content.toLowerCase().includes(payment.transferContent.toLowerCase());
}

/**
 * Lọc danh sách payments khớp với một bank transaction.
 * Chỉ auto-match nếu có đúng 1 candidate.
 */
function findMatchingPayments(bankTx: BankTransaction, payments: Payment[]): Payment[] {
  return payments.filter((p) => isPaymentMatchingBankTx(p, bankTx));
}

/**
 * Kiểm tra điều kiện kích hoạt conversion:
 * Tổng verified payments >= order total amount.
 */
function shouldTriggerConversion(verifiedPayments: number[], orderTotal: number): boolean {
  const total = verifiedPayments.reduce((sum, amt) => sum + amt, 0);
  return total >= orderTotal;
}

// ─── Payment matching ─────────────────────────────────────────────────────────

describe('isPaymentMatchingBankTx — khớp payment với bank transaction', () => {
  const payment: Payment = {
    id: BigInt(1),
    status: 'PENDING',
    amount: 500000,
    transferContent: 'CK001',
  };

  const bankTx: BankTransaction = {
    id: BigInt(10),
    matchStatus: 'UNMATCHED',
    amount: 500000,
    content: 'THANHTOAN CK001 NGUYENVAN',
  };

  it('khớp chính xác: amount bằng nhau + content chứa transferContent', () => {
    expect(isPaymentMatchingBankTx(payment, bankTx)).toBe(true);
  });

  it('không khớp: amount khác nhau', () => {
    const differentAmountTx = { ...bankTx, amount: 300000 };
    expect(isPaymentMatchingBankTx(payment, differentAmountTx)).toBe(false);
  });

  it('không khớp: content không chứa transferContent', () => {
    const unrelatedTx = { ...bankTx, content: 'THANHTOAN CK999 KHACHHANG' };
    expect(isPaymentMatchingBankTx(payment, unrelatedTx)).toBe(false);
  });

  it('không match: payment không ở trạng thái PENDING', () => {
    const verifiedPayment = { ...payment, status: 'VERIFIED' as const };
    expect(isPaymentMatchingBankTx(verifiedPayment, bankTx)).toBe(false);
  });

  it('không match: bank transaction đã được matched', () => {
    const matchedTx = { ...bankTx, matchStatus: 'AUTO_MATCHED' as const };
    expect(isPaymentMatchingBankTx(payment, matchedTx)).toBe(false);
  });

  it('không match: transferContent là null', () => {
    const noContentPayment = { ...payment, transferContent: null };
    expect(isPaymentMatchingBankTx(noContentPayment, bankTx)).toBe(false);
  });

  it('so sánh content case-insensitive', () => {
    const upperContentTx = { ...bankTx, content: 'THANHTOAN ck001 NGUYEN' };
    expect(isPaymentMatchingBankTx(payment, upperContentTx)).toBe(true);
  });

  it('transferContent uppercase — content lowercase vẫn khớp', () => {
    const upperPayment = { ...payment, transferContent: 'CK001' };
    const lowerTx = { ...bankTx, content: 'thanhtoan ck001 nguyen' };
    expect(isPaymentMatchingBankTx(upperPayment, lowerTx)).toBe(true);
  });
});

// ─── findMatchingPayments — chọn candidate duy nhất ──────────────────────────

describe('findMatchingPayments — lọc candidates cho bank transaction', () => {
  const bankTx: BankTransaction = {
    id: BigInt(10),
    matchStatus: 'UNMATCHED',
    amount: 500000,
    content: 'THANHTOAN CK001 NGUYENVAN',
  };

  it('đúng 1 candidate → auto-match được', () => {
    const payments: Payment[] = [
      { id: BigInt(1), status: 'PENDING', amount: 500000, transferContent: 'CK001' },
      { id: BigInt(2), status: 'PENDING', amount: 300000, transferContent: 'CK002' },
    ];
    const result = findMatchingPayments(bankTx, payments);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(BigInt(1));
  });

  it('0 candidates → không match', () => {
    const payments: Payment[] = [
      { id: BigInt(1), status: 'PENDING', amount: 200000, transferContent: 'CK999' },
    ];
    expect(findMatchingPayments(bankTx, payments)).toHaveLength(0);
  });

  it('2+ candidates → ambiguous, bỏ qua (manager xử lý thủ công)', () => {
    const payments: Payment[] = [
      { id: BigInt(1), status: 'PENDING', amount: 500000, transferContent: 'CK001' },
      { id: BigInt(2), status: 'PENDING', amount: 500000, transferContent: 'CK001' },
    ];
    const result = findMatchingPayments(bankTx, payments);
    expect(result.length).toBeGreaterThan(1);
    // Khi length !== 1 → không auto-match
  });

  it('danh sách payments rỗng → không match', () => {
    expect(findMatchingPayments(bankTx, [])).toHaveLength(0);
  });
});

// ─── shouldTriggerConversion — kích hoạt chuyển đổi ──────────────────────────

describe('shouldTriggerConversion — tổng verified >= order total', () => {
  it('tổng verified bằng đúng order total → trigger', () => {
    expect(shouldTriggerConversion([1000000], 1000000)).toBe(true);
  });

  it('tổng verified vượt order total → trigger', () => {
    expect(shouldTriggerConversion([600000, 500000], 1000000)).toBe(true);
  });

  it('tổng verified chưa đủ → không trigger', () => {
    expect(shouldTriggerConversion([300000, 200000], 1000000)).toBe(false);
  });

  it('thanh toán nhiều lần CK1+CK2+CK3 = 100% → trigger', () => {
    // CK lần 1: 30%, lần 2: 40%, lần 3: 30%
    expect(shouldTriggerConversion([300000, 400000, 300000], 1000000)).toBe(true);
  });

  it('CK lần 1 (30%) + CK lần 2 (70%) = đủ 100% → trigger', () => {
    expect(shouldTriggerConversion([300000, 700000], 1000000)).toBe(true);
  });

  it('chỉ có 1 khoản chưa đủ → không trigger', () => {
    expect(shouldTriggerConversion([500000], 1000000)).toBe(false);
  });

  it('mảng rỗng (chưa có thanh toán) → không trigger', () => {
    expect(shouldTriggerConversion([], 1000000)).toBe(false);
  });

  it('order total = 0 → luôn trigger (edge case)', () => {
    expect(shouldTriggerConversion([0], 0)).toBe(true);
  });
});
