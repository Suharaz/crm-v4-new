import { describe, it, expect } from 'vitest';
import {
  sanitizeCsvCell,
  sanitizeCsvRow,
} from '../../../packages/utils/src/csv-sanitizer';

describe('sanitizeCsvCell', () => {
  // Các ký tự nguy hiểm phải được prefix bằng \t để ngăn formula injection

  it('prefix = bằng tab để ngăn Excel formula', () => {
    expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe('\t=SUM(A1:A10)');
  });

  it('prefix + (command injection pattern)', () => {
    expect(sanitizeCsvCell("+cmd|'/C calc'")).toBe("\t+cmd|'/C calc'");
  });

  it('prefix - (negative number / command)', () => {
    expect(sanitizeCsvCell('-cmd')).toBe('\t-cmd');
  });

  it('prefix @ (DDE injection)', () => {
    expect(sanitizeCsvCell('@SUM')).toBe('\t@SUM');
  });

  it('prefix | (pipe injection)', () => {
    expect(sanitizeCsvCell('|cmd')).toBe('\t|cmd');
  });

  it('văn bản bình thường giữ nguyên', () => {
    expect(sanitizeCsvCell('Normal text')).toBe('Normal text');
  });

  it('chuỗi rỗng trả về rỗng', () => {
    expect(sanitizeCsvCell('')).toBe('');
  });

  it('số thuần túy giữ nguyên', () => {
    expect(sanitizeCsvCell('123')).toBe('123');
  });

  it('null trả về chuỗi rỗng', () => {
    expect(sanitizeCsvCell(null)).toBe('');
  });

  it('undefined trả về chuỗi rỗng', () => {
    expect(sanitizeCsvCell(undefined)).toBe('');
  });

  it('ký tự nguy hiểm ở giữa chuỗi không bị prefix', () => {
    // Chỉ prefix khi ký tự nguy hiểm ở VỊ TRÍ ĐẦU
    expect(sanitizeCsvCell('abc=SUM')).toBe('abc=SUM');
  });

  it('email bình thường không bị prefix (@ không ở đầu)', () => {
    expect(sanitizeCsvCell('user@example.com')).toBe('user@example.com');
  });
});

describe('sanitizeCsvRow', () => {
  it('sanitize toàn bộ các field trong một row', () => {
    const row = {
      name: 'Nguyễn Văn A',
      formula: '=HYPERLINK("http://evil.com")',
      phone: '0912345678',
      note: '+malicious',
    };
    const result = sanitizeCsvRow(row);
    expect(result.name).toBe('Nguyễn Văn A');
    expect(result.formula).toBe('\t=HYPERLINK("http://evil.com")');
    expect(result.phone).toBe('0912345678');
    expect(result.note).toBe('\t+malicious');
  });

  it('row rỗng trả về object rỗng', () => {
    expect(sanitizeCsvRow({})).toEqual({});
  });

  it('chuyển đổi giá trị số thành string', () => {
    const result = sanitizeCsvRow({ amount: 500000 as unknown as string });
    expect(result.amount).toBe('500000');
  });
});
