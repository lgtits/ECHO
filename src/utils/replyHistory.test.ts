import { describe, expect, it } from 'vitest';
import { buildVersions } from './replyHistory';

const reply = { body: '第三版', createdAt: '2026-11-23T03:00:00Z' };

describe('buildVersions（spec AC6.6）', () => {
  it('沒編輯過：只有目前版本，時間是回覆時間', () => {
    expect(buildVersions(reply, [])).toEqual([
      { body: '第三版', at: reply.createdAt, index: 0, current: true },
    ]);
  });

  it('每筆記錄是編輯前的內容；版本時間接在前一次編輯之後', () => {
    const edits = [
      // 故意打亂順序
      { body: '第二版', editedAt: '2026-11-23T03:20:00Z' },
      { body: '第一版', editedAt: '2026-11-23T03:10:00Z' },
    ];
    expect(buildVersions(reply, edits)).toEqual([
      { body: '第一版', at: '2026-11-23T03:00:00Z', index: 0, current: false },
      { body: '第二版', at: '2026-11-23T03:10:00Z', index: 1, current: false },
      { body: '第三版', at: '2026-11-23T03:20:00Z', index: 2, current: true },
    ]);
  });
});
