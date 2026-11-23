// 假資料儲存（plan §6.1）：存在 localStorage，重新整理後保留；
// 同一台電腦的其他分頁透過 storage 事件同步，方便同時開會友端與管理端走查。

import type { ReplyAuthorKind, SessionStatus } from '@/types/models';
import { buildSeed } from './seed';

export interface DbSession {
  id: string;
  code: string;
  title: string;
  speaker: string | null;
  scripture: string | null;
  sermonDate: string;
  status: SessionStatus;
  autoCloseAt: string | null;
  createdAt: string;
}

export interface DbPost {
  id: string;
  sessionId: string;
  authorId: string;
  nickname: string | null;
  body: string;
  isHidden: boolean;
  hiddenByName: string | null;
  hiddenAt: string | null;
  createdAt: string;
}

export interface DbUpvote {
  postId: string;
  userId: string;
}

export interface DbReply {
  id: string;
  postId: string;
  sessionId: string;
  /** staff = 牧者回覆；member = 會友接續留言（spec US10） */
  authorKind: ReplyAuthorKind;
  /** 牧者回覆是管理者 uid、接續留言是會友 uid（只對外公開牧者的，同 DB 的 member_id） */
  authorId: string;
  authorName: string;
  body: string;
  isHidden: boolean;
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockDb {
  version: number;
  sessions: DbSession[];
  posts: DbPost[];
  upvotes: DbUpvote[];
  replies: DbReply[];
}

export interface MockStaff {
  uid: string;
  email: string;
  displayName: string;
}

/** 2：replies 加 authorKind、isHidden（spec US10，2026-11-23） */
export const DB_VERSION = 2;
const KEY_DB = 'echo.mock.db';
const KEY_UID = 'echo.mock.uid';
export const KEY_STAFF = 'echo.mock.staff';
const KEY_LIVE = 'echo.mock.live';

/** 管理帳號只有一種身分，牧者、同工權限相同（spec D12） */
export const MOCK_ADMIN: Omit<MockStaff, 'email'> = { uid: 'staff-pastor', displayName: '王牧師' };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 無痕模式等情況存不了，就只留在記憶體
  }
}

export function newId(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return prefix + rand;
}

export function memberUid(): string {
  let uid = read<string>(KEY_UID);
  if (!uid) {
    uid = newId('member-');
    write(KEY_UID, uid);
  }
  return uid;
}

export function currentStaff(): MockStaff | null {
  return read<MockStaff>(KEY_STAFF);
}

export function setCurrentStaff(staff: MockStaff | null): void {
  write(KEY_STAFF, staff);
}

export function liveActivity(): boolean {
  return read<boolean>(KEY_LIVE) ?? true;
}

export function setLiveActivity(on: boolean): void {
  write(KEY_LIVE, on);
}

// ── 資料本體 ───────────────────────────────────────────

let cache: MockDb | null = null;
const listeners = new Set<() => void>();

export function db(): MockDb {
  if (!cache) {
    const stored = read<MockDb>(KEY_DB);
    if (stored && stored.version === DB_VERSION) cache = stored;
    else {
      cache = buildSeed(memberUid());
      write(KEY_DB, cache);
    }
  }
  return cache;
}

/** 修改資料後呼叫：寫回 localStorage 並通知本分頁的訂閱者 */
export function commit(): void {
  write(KEY_DB, cache);
  listeners.forEach((fn) => fn());
}

export function resetDb(): void {
  cache = buildSeed(memberUid());
  commit();
}

export function onDbChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY_DB) {
      cache = null;
      listeners.forEach((fn) => fn());
    }
  });
}

export function delay(min = 120, max = 380): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}
