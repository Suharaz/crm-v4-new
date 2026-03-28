import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  isValidVNPhone,
  formatPhoneDisplay,
} from '../../../packages/utils/src/phone-normalizer';

describe('normalizePhone', () => {
  it('chuyển +84 prefix thành 0', () => {
    expect(normalizePhone('+84912345678')).toBe('0912345678');
  });

  it('chuyển 84 prefix (không có +) thành 0 khi đủ 11+ ký tự', () => {
    expect(normalizePhone('84912345678')).toBe('0912345678');
  });

  it('xóa khoảng trắng', () => {
    expect(normalizePhone('0912 345 678')).toBe('0912345678');
  });

  it('xóa dấu gạch ngang', () => {
    expect(normalizePhone('091-234-5678')).toBe('0912345678');
  });

  it('xóa dấu chấm', () => {
    expect(normalizePhone('0912.345.678')).toBe('0912345678');
  });

  it('giữ nguyên số đã chuẩn hóa 10 chữ số', () => {
    expect(normalizePhone('0912345678')).toBe('0912345678');
  });

  it('chấp nhận số 11 chữ số (đầu số cũ)', () => {
    expect(normalizePhone('09123456789')).toBe('09123456789');
  });

  it('trim khoảng trắng đầu cuối', () => {
    expect(normalizePhone('  0912345678  ')).toBe('0912345678');
  });

  it('xóa dấu ngoặc đơn', () => {
    expect(normalizePhone('(091)2345678')).toBe('0912345678');
  });
});

describe('isValidVNPhone', () => {
  it('số 10 chữ số bắt đầu bằng 0 → hợp lệ', () => {
    expect(isValidVNPhone('0912345678')).toBe(true);
  });

  it('số 11 chữ số bắt đầu bằng 0 → hợp lệ', () => {
    expect(isValidVNPhone('09123456789')).toBe(true);
  });

  it('không có số 0 đầu → không hợp lệ', () => {
    expect(isValidVNPhone('912345678')).toBe(false);
  });

  it('quá ngắn → không hợp lệ', () => {
    expect(isValidVNPhone('012345')).toBe(false);
  });

  it('chứa chữ cái → không hợp lệ', () => {
    expect(isValidVNPhone('abcdefghij')).toBe(false);
  });

  it('chuỗi rỗng → không hợp lệ', () => {
    expect(isValidVNPhone('')).toBe(false);
  });

  it('số +84 hợp lệ sau khi chuẩn hóa → hợp lệ', () => {
    expect(isValidVNPhone('+84912345678')).toBe(true);
  });

  it('số quá dài (12 chữ số) → không hợp lệ', () => {
    expect(isValidVNPhone('012345678901')).toBe(false);
  });
});

describe('formatPhoneDisplay', () => {
  it('định dạng số 10 chữ số thành 3-3-4', () => {
    expect(formatPhoneDisplay('0912345678')).toBe('091 234 5678');
  });

  it('định dạng số 11 chữ số thành 4-3-4', () => {
    expect(formatPhoneDisplay('09123456789')).toBe('0912 345 6789');
  });

  it('chuẩn hóa trước khi định dạng: +84 prefix', () => {
    expect(formatPhoneDisplay('+84912345678')).toBe('091 234 5678');
  });

  it('trả về nguyên gốc nếu không đúng 10/11 chữ số', () => {
    expect(formatPhoneDisplay('12345')).toBe('12345');
  });
});
