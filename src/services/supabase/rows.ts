// DB 資料列 ↔ 領域模型轉換（憲章：轉換只在 services/ 內進行）。
// 資料列型別對應 supabase/migrations；之後以 `supabase gen types` 產生的 types/database.ts 取代（T016）。

import type { Post, Reply, Session, SessionStatus, SessionSummary } from '@/types/models';

export type SessionRow = {
  id: string;
  code: string;
  title: string;
  speaker: string | null;
  scripture: string | null;
  sermon_date: string;
  status: SessionStatus;
  auto_close_at: string | null;
  created_at: string;
};

export type ReplyRow = {
  id: string;
  post_id: string;
  author_kind: 'staff' | 'member';
  author_id: string | null;
  author_name: string;
  body: string;
  is_hidden: boolean;
  hidden_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReplyEditRow = {
  body: string;
  edited_at: string;
};

export type PostRow = {
  id: string;
  session_id: string;
  nickname: string | null;
  body: string;
  upvote_count: number;
  /** 牧者回覆數 */
  reply_count: number;
  /** 未隱藏的接續留言數（spec US10） */
  comment_count: number;
  is_hidden: boolean;
  hidden_by_name: string | null;
  hidden_at: string | null;
  created_at: string;
  replies: ReplyRow[];
  /** RLS 只回傳自己的附議 */
  upvotes: { user_id: string }[];
};

export type SessionCountRow = {
  session_id: string;
  post_count: number;
  pending_count: number;
};

export const SESSION_COLUMNS =
  'id, code, title, speaker, scripture, sermon_date, status, auto_close_at, created_at';

/** replies 有欄位層級權限（member_id 讀不到），必須明確列出欄位 */
export const REPLY_COLUMNS =
  'id, post_id, author_kind, author_id, author_name, body, is_hidden, hidden_at, edited_at, created_at, updated_at';

/** posts 有欄位層級權限（author_id 讀不到），必須明確列出欄位，不能用 *（plan §3.2） */
export const POST_COLUMNS =
  'id, session_id, nickname, body, upvote_count, reply_count, comment_count, is_hidden, hidden_by_name, hidden_at, created_at, ' +
  `replies (${REPLY_COLUMNS}), upvotes (user_id)`;

export function toSession(r: SessionRow): Session {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    speaker: r.speaker,
    scripture: r.scripture,
    sermonDate: r.sermon_date,
    status: r.status,
    autoCloseAt: r.auto_close_at,
    createdAt: r.created_at,
  };
}

export function toSummary(r: SessionRow, counts?: SessionCountRow): SessionSummary {
  return {
    ...toSession(r),
    postCount: counts?.post_count ?? 0,
    pendingCount: counts?.pending_count ?? 0,
  };
}

export function toReply(r: ReplyRow): Reply {
  return {
    id: r.id,
    postId: r.post_id,
    authorKind: r.author_kind,
    authorId: r.author_id,
    authorName: r.author_name,
    body: r.body,
    isHidden: r.is_hidden,
    hiddenAt: r.hidden_at,
    editedAt: r.edited_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toPost(r: PostRow, uid: string | null): Post {
  return {
    id: r.id,
    sessionId: r.session_id,
    nickname: r.nickname,
    body: r.body,
    upvoteCount: r.upvote_count,
    isHidden: r.is_hidden,
    hiddenByName: r.hidden_by_name,
    hiddenAt: r.hidden_at,
    createdAt: r.created_at,
    replies: [...(r.replies ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(toReply),
    upvotedByMe: !!uid && (r.upvotes ?? []).some((u) => u.user_id === uid),
  };
}

/** 前端產生留言 id（送出後用它讀回，避免 RETURNING 碰到 author_id 欄位權限） */
export function newUuid(): string {
  const c: Crypto = globalThis.crypto;
  // 非 https（例如手機連區網 IP 測試）時沒有 randomUUID，只有 getRandomValues
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
