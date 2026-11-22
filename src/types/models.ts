// 前端領域模型（手寫，憲章「型別安全」）。
// DB 型別（types/database.ts，Phase 2 產生）與這裡的轉換只在 services/ 內進行。

export type SessionStatus = 'draft' | 'open' | 'closed';

export interface Session {
  id: string;
  /** 6 碼場次碼，排除 0/O/1/I/L */
  code: string;
  title: string;
  speaker: string | null;
  scripture: string | null;
  /** 講道日期 YYYY-MM-DD */
  sermonDate: string;
  status: SessionStatus;
  /** 自動結束時間 ISO 字串（AC5.9） */
  autoCloseAt: string | null;
  createdAt: string;
}

/** 列表用：附上留言數與待回應數（AC5.5） */
export interface SessionSummary extends Session {
  postCount: number;
  /** 未隱藏、沒有文字回覆的留言數（管理端才有意義） */
  pendingCount: number;
}

export interface Reply {
  id: string;
  postId: string;
  authorId: string | null;
  /** 回覆當下的顯示名稱快照，例：王牧師（Q4） */
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Post {
  id: string;
  sessionId: string;
  nickname: string | null;
  body: string;
  upvoteCount: number;
  isHidden: boolean;
  hiddenByName: string | null;
  hiddenAt: string | null;
  createdAt: string;
  replies: Reply[];
  /** 相對於目前的檢視者 */
  upvotedByMe: boolean;
}

export interface StaffProfile {
  displayName: string;
}

/** 目前使用這個瀏覽器的人 */
export interface Viewer {
  uid: string;
  /** 不是管理者時為 null */
  staff: StaffProfile | null;
}

export interface SessionInput {
  title: string;
  speaker: string | null;
  scripture: string | null;
  sermonDate: string;
  autoCloseAt: string | null;
}

export interface PostInput {
  body: string;
  nickname: string | null;
}

/** 回應者名稱留空時顯示的名稱（spec AC6.2、D18；DB trigger 同值） */
export const DEFAULT_REPLY_AUTHOR = '牧者';

/** 限制值（spec AC2.1、AC2.3、AC6.2；DB 端以 check / trigger 強制） */
export const LIMITS = {
  postBody: 500,
  nickname: 20,
  replyBody: 2000,
  replyAuthor: 20,
  sessionTitle: 100,
  postsPerMinute: 5,
  pastPageSize: 20,
} as const;
