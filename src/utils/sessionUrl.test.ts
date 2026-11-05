import { describe, expect, it } from 'vitest';
import { buildNowUrl, buildSessionUrl } from './sessionUrl';

describe('buildSessionUrl', () => {
  it('組出 /s/:code', () => {
    expect(buildSessionUrl('https://qa.example.org', 'K7PM2X')).toBe(
      'https://qa.example.org/s/K7PM2X',
    );
  });

  it('保留 github.io 的 /echo 路徑並去掉多餘斜線', () => {
    expect(buildSessionUrl('https://user.github.io/echo/', 'K7PM2X')).toBe(
      'https://user.github.io/echo/s/K7PM2X',
    );
  });

  it('場次碼一律大寫', () => {
    expect(buildSessionUrl('https://qa.example.org', 'k7pm2x')).toBe(
      'https://qa.example.org/s/K7PM2X',
    );
  });
});

describe('buildNowUrl', () => {
  it('組出固定入口 /now', () => {
    expect(buildNowUrl('https://user.github.io/echo/')).toBe('https://user.github.io/echo/now');
  });
});
