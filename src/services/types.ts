// 服務介面：mock 與 supabase 實作同一組（plan §6.1）。
// 元件不得直接呼叫 supabase，一律經 services → stores（憲章）。

import type {
  Post,
  PostInput,
  Reply,
  Session,
  SessionInput,
  SessionStatus,
  SessionSummary,
  Viewer,
} from '@/types/models';

export type ServiceErrorCode =
  | 'rate_limited'
  | 'session_closed'
  | 'not_found'
  | 'forbidden'
  | 'invalid_credentials'
  | 'not_staff'
  | 'invalid_input'
  | 'network'
  | 'unknown';

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ServiceError';
  }
}

export interface AuthService {
  /** 取得目前身分；會友第一次進入時在背景建立匿名身分（AC1.4） */
  getViewer(): Promise<Viewer>;
  /** 管理端只輸入密碼，登入共用的管理帳號（spec D14） */
  signIn(password: string): Promise<Viewer>;
  signOut(): Promise<Viewer>;
}

export interface PastPage {
  items: SessionSummary[];
  hasMore: boolean;
}

export interface SessionsService {
  // ── 會友端（只看得到 open / closed）
  listOpen(): Promise<SessionSummary[]>;
  listPast(offset: number, limit: number): Promise<PastPage>;
  /** 草稿或不存在時回傳 null（AC1.3） */
  getByCode(code: string): Promise<Session | null>;
  /** 固定 QR：日期最近、建立最晚的開放中場次（AC1.7） */
  findCurrent(): Promise<Session | null>;

  // ── 管理端
  listAll(): Promise<SessionSummary[]>;
  getById(id: string): Promise<Session | null>;
  create(input: SessionInput, status: Extract<SessionStatus, 'draft' | 'open'>): Promise<Session>;
  update(id: string, input: SessionInput): Promise<Session>;
  /** 重新開放時清除自動結束時間（AC5.9） */
  setStatus(id: string, status: SessionStatus): Promise<Session>;
  setAutoClose(id: string, autoCloseAt: string | null): Promise<Session>;
  remove(id: string): Promise<void>;
  /** 過去用過的講員，最近的在前（A3 預設值與提示） */
  recentSpeakers(): Promise<string[]>;
}

export interface PostsService {
  /** 管理者可帶 includeHidden */
  listBySession(sessionId: string, opts?: { includeHidden?: boolean }): Promise<Post[]>;
  create(sessionId: string, input: PostInput): Promise<Post>;
  setUpvote(postId: string, on: boolean): Promise<Post>;
  setHidden(postId: string, hidden: boolean): Promise<Post>;
  /** 管理者永久刪除留言（連同附議與回覆，spec D15） */
  remove(postId: string): Promise<void>;
}

export interface RepliesService {
  create(postId: string, body: string): Promise<Reply>;
  update(replyId: string, body: string): Promise<Reply>;
  remove(replyId: string): Promise<void>;
}

export type ConnectionState = 'connected' | 'disconnected';

export interface SessionEventHandlers {
  /** 新增或更新（附議數、回覆、隱藏狀態）；post 已依檢視者計算 upvotedByMe */
  onPostUpsert(post: Post): void;
  /** 被刪除，或會友端看到的留言被隱藏（AC4.2） */
  onPostRemoved(postId: string): void;
  onSessionChange(session: Session | null): void;
  onConnection(state: ConnectionState): void;
}

export interface RealtimeService {
  /** 回傳取消訂閱函式 */
  subscribeSession(
    sessionId: string,
    opts: { includeHidden: boolean },
    handlers: SessionEventHandlers,
  ): () => void;
}

/** 只有 mock 實作才有的示範工具 */
export interface DemoTools {
  reset(): void;
  isLiveActivity(): boolean;
  setLiveActivity(on: boolean): void;
  /** 模擬斷線幾秒後自動恢復（ux.md M4） */
  simulateDisconnect(seconds: number): void;
}

export interface Services {
  source: 'mock' | 'supabase';
  auth: AuthService;
  sessions: SessionsService;
  posts: PostsService;
  replies: RepliesService;
  realtime: RealtimeService;
  demo: DemoTools | null;
}
