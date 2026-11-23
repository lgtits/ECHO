import { describe, expect, it } from 'vitest';
import { ServiceError } from '../types';
import { toServiceError } from './errors';
import { type PostRow, newUuid, toPost, toSummary } from './rows';

const row = (over: Partial<PostRow> = {}): PostRow => ({
  id: 'p1',
  session_id: 's1',
  nickname: null,
  body: '內容',
  upvote_count: 3,
  reply_count: 2,
  comment_count: 0,
  is_hidden: false,
  hidden_by_name: null,
  hidden_at: null,
  created_at: '2026-11-15T03:00:00Z',
  replies: [
    {
      id: 'r2',
      post_id: 'p1',
      author_kind: 'staff',
      author_id: 'a',
      author_name: '牧者',
      is_hidden: false,
      hidden_at: null,
      body: '第二',
      created_at: '2026-11-15T03:10:00Z',
      updated_at: '2026-11-15T03:10:00Z',
    },
    {
      id: 'r1',
      post_id: 'p1',
      author_kind: 'staff',
      author_id: 'a',
      author_name: '牧者',
      is_hidden: false,
      hidden_at: null,
      body: '第一',
      created_at: '2026-11-15T03:05:00Z',
      updated_at: '2026-11-15T03:05:00Z',
    },
  ],
  upvotes: [{ user_id: 'me' }],
  ...over,
});

describe('toPost', () => {
  it('欄位轉成 camelCase，回覆依時間排序', () => {
    const p = toPost(row(), 'me');
    expect(p.sessionId).toBe('s1');
    expect(p.upvoteCount).toBe(3);
    expect(p.replies.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(p.replies[0]?.authorName).toBe('牧者');
  });

  it('upvotedByMe 只看自己的附議', () => {
    expect(toPost(row(), 'me').upvotedByMe).toBe(true);
    expect(toPost(row(), 'other').upvotedByMe).toBe(false);
    expect(toPost(row(), null).upvotedByMe).toBe(false);
    expect(toPost(row({ upvotes: [] }), 'me').upvotedByMe).toBe(false);
  });
});

describe('toSummary', () => {
  const s = {
    id: 's1',
    code: 'K7PM2X',
    title: '標題',
    speaker: null,
    scripture: null,
    sermon_date: '2026-11-15',
    status: 'open' as const,
    auto_close_at: null,
    created_at: '2026-11-10T00:00:00Z',
  };

  it('帶入留言數與待回應數', () => {
    const r = toSummary(s, { session_id: 's1', post_count: 5, pending_count: 2 });
    expect(r).toMatchObject({ sermonDate: '2026-11-15', postCount: 5, pendingCount: 2 });
  });

  it('沒有留言時為 0', () => {
    expect(toSummary(s)).toMatchObject({ postCount: 0, pendingCount: 0 });
  });
});

describe('toServiceError', () => {
  const code = (e: unknown) => toServiceError(e).code;

  it('DB 自訂錯誤 echo:<code>', () => {
    expect(code({ message: 'echo:rate_limited', code: 'P0001' })).toBe('rate_limited');
    expect(code({ message: 'echo:session_closed', code: 'P0001' })).toBe('session_closed');
  });

  it('Postgres 錯誤碼', () => {
    expect(code({ message: 'new row violates row-level security policy', code: '42501' })).toBe(
      'forbidden',
    );
    expect(code({ message: 'violates check constraint', code: '23514' })).toBe('invalid_input');
    expect(code({ message: 'no rows', code: 'PGRST116' })).toBe('not_found');
  });

  it('網路錯誤', () => {
    expect(code({ message: 'TypeError: Failed to fetch' })).toBe('network');
  });

  it('ServiceError 原樣傳回', () => {
    const e = new ServiceError('not_staff');
    expect(toServiceError(e)).toBe(e);
  });
});

describe('newUuid', () => {
  it('產生 UUID v4 格式', () => {
    expect(newUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
