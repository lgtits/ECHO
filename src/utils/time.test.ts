import { describe, expect, it } from 'vitest';
import { formatLongDate, formatPostTime, formatShortDate, nextSunday } from './time';

describe('formatPostTime', () => {
  const now = new Date(2026, 10, 8, 11, 30); // 2026/11/8 11:30（主日）

  it('1 分鐘內顯示「剛剛」', () => {
    expect(formatPostTime(new Date(2026, 10, 8, 11, 29, 40).toISOString(), now)).toBe('剛剛');
  });

  it('1 小時內顯示相對時間', () => {
    expect(formatPostTime(new Date(2026, 10, 8, 11, 27).toISOString(), now)).toBe('3 分鐘前');
  });

  it('同一天超過 1 小時顯示 HH:mm', () => {
    expect(formatPostTime(new Date(2026, 10, 8, 9, 5).toISOString(), now)).toBe('09:05');
  });

  it('跨日顯示 M/D HH:mm', () => {
    expect(formatPostTime(new Date(2026, 10, 1, 11, 48).toISOString(), now)).toBe('11/1 11:48');
  });
});

describe('日期', () => {
  it('短日期與長日期', () => {
    expect(formatShortDate('2026-11-08')).toBe('11/8');
    expect(formatLongDate('2026-11-08')).toBe('11 月 8 日 主日');
    expect(formatLongDate('2026-11-11')).toBe('11 月 11 日 週三');
  });

  it('下一個主日：週一 → 當週日', () => {
    expect(nextSunday(new Date(2026, 10, 2))).toBe('2026-11-08');
  });

  it('下一個主日：今天是主日就是今天', () => {
    expect(nextSunday(new Date(2026, 10, 8, 9))).toBe('2026-11-08');
  });

  it('下一個主日：週六 → 隔天', () => {
    expect(nextSunday(new Date(2026, 10, 7))).toBe('2026-11-08');
  });
});
