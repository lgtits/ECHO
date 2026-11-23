// 假資料實作（plan §6.1）。只模擬畫面需要的行為；真正的權限在 Phase 2 以 RLS 實作。

import type { Post, Reply, Session, SessionSummary, Viewer } from '@/types/models';
import { ANONYMOUS, DEFAULT_REPLY_AUTHOR, LIMITS } from '@/types/models';
import { ServiceError } from '../types';
import type { ConnectionState, Services, SessionEventHandlers } from '../types';
import type { DbPost, DbReply, DbSession } from './db';
import {
  MOCK_ADMIN,
  commit,
  currentStaff,
  db,
  delay,
  liveActivity,
  memberUid,
  newId,
  onDbChange,
  resetDb,
  setCurrentStaff,
  setLiveActivity,
} from './db';
import { SAMPLE_POSTS, genCode } from './seed';
import { buildVersions } from '@/utils/replyHistory';

// ── 身分 ───────────────────────────────────────────────

function viewer(): Viewer {
  const staff = currentStaff();
  if (staff) return { uid: staff.uid, staff: { displayName: staff.displayName } };
  return { uid: memberUid(), staff: null };
}

function requireStaff() {
  const v = viewer();
  if (!v.staff) throw new ServiceError('forbidden');
  return v as Viewer & { staff: NonNullable<Viewer['staff']> };
}

// ── 轉換 ───────────────────────────────────────────────

/** 模擬 pg_cron：到時間的開放場次改為已結束 */
function applyAutoClose(): boolean {
  const now = Date.now();
  let changed = false;
  for (const s of db().sessions) {
    if (s.status === 'open' && s.autoCloseAt && new Date(s.autoCloseAt).getTime() <= now) {
      s.status = 'closed';
      changed = true;
    }
  }
  return changed;
}

const toSession = (s: DbSession): Session => ({ ...s });

/** 與 DB 相同：接續留言不公開作者（spec D11） */
const toReply = (r: DbReply): Reply => ({
  id: r.id,
  postId: r.postId,
  authorKind: r.authorKind,
  authorId: r.authorKind === 'staff' ? r.authorId : null,
  authorName: r.authorName,
  body: r.body,
  isHidden: r.isHidden,
  hiddenAt: r.hiddenAt,
  editedAt: r.editedAt,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

function toPost(p: DbPost, uid: string): Post {
  const d = db();
  const votes = d.upvotes.filter((u) => u.postId === p.id);
  // 會友看不到隱藏的接續留言（與 RLS 相同）
  const staff = !!currentStaff();
  const replies: Reply[] = d.replies
    .filter((r) => r.postId === p.id && (staff || !r.isHidden))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toReply);
  return {
    id: p.id,
    sessionId: p.sessionId,
    nickname: p.nickname,
    body: p.body,
    upvoteCount: votes.length,
    isHidden: p.isHidden,
    hiddenByName: p.hiddenByName,
    hiddenAt: p.hiddenAt,
    createdAt: p.createdAt,
    replies,
    upvotedByMe: votes.some((u) => u.userId === uid),
  };
}

function summarize(s: DbSession): SessionSummary {
  const posts = db().posts.filter((p) => p.sessionId === s.id && !p.isHidden);
  const replied = new Set(
    db()
      .replies.filter((r) => r.sessionId === s.id && r.authorKind === 'staff')
      .map((r) => r.postId),
  );
  return {
    ...toSession(s),
    postCount: posts.length,
    pendingCount: posts.filter((p) => !replied.has(p.id)).length,
  };
}

const byDateDesc = (a: DbSession, b: DbSession) =>
  b.sermonDate.localeCompare(a.sermonDate) || b.createdAt.localeCompare(a.createdAt);

function findSession(id: string): DbSession {
  const s = db().sessions.find((x) => x.id === id);
  if (!s) throw new ServiceError('not_found');
  return s;
}

function findPost(id: string): DbPost {
  const p = db().posts.find((x) => x.id === id);
  if (!p) throw new ServiceError('not_found');
  return p;
}

/** 與 DB 的 session_is_writable() 相同規則 */
function writable(s: DbSession): boolean {
  return s.status === 'open' && (!s.autoCloseAt || Date.now() < new Date(s.autoCloseAt).getTime());
}

function visibleToMember(p: DbPost): boolean {
  if (p.isHidden) return false;
  const s = db().sessions.find((x) => x.id === p.sessionId);
  return !!s && s.status !== 'draft';
}

function assertOnline() {
  if (offline) throw new ServiceError('network');
}

// ── 連線狀態（瀏覽器離線事件 + 示範工具的模擬斷線）──────────

let offline = typeof navigator !== 'undefined' && navigator.onLine === false;
const connectionListeners = new Set<(s: ConnectionState) => void>();

function setOffline(v: boolean) {
  if (offline === v) return;
  offline = v;
  connectionListeners.forEach((fn) => fn(v ? 'disconnected' : 'connected'));
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => setOffline(true));
  window.addEventListener('online', () => setOffline(false));
}

// ── 模擬會友活動：有人訂閱開放中的場次時，每隔一段時間附議或留言 ──

const liveSessions = new Map<string, number>();
let liveTimer: ReturnType<typeof setInterval> | null = null;

function liveTick() {
  if (offline || !liveActivity()) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  const ids = [...liveSessions.keys()];
  const s = db().sessions.find((x) => x.id === ids[Math.floor(Math.random() * ids.length)]);
  if (!s || !writable(s)) return;
  const visible = db().posts.filter((p) => p.sessionId === s.id && !p.isHidden);
  if (visible.length > 0 && Math.random() < 0.65) {
    const target = visible[Math.floor(Math.random() * Math.min(visible.length, 6))]!;
    db().upvotes.push({ postId: target.id, userId: newId('fake-') });
  } else {
    db().posts.push({
      id: newId('post-'),
      sessionId: s.id,
      authorId: newId('fake-author-'),
      nickname:
        Math.random() < 0.5
          ? null
          : ['以利亞', '小恩', '路得', '提摩太'][Math.floor(Math.random() * 4)]!,
      body: SAMPLE_POSTS[Math.floor(Math.random() * SAMPLE_POSTS.length)]!,
      isHidden: false,
      hiddenByName: null,
      hiddenAt: null,
      createdAt: new Date().toISOString(),
    });
  }
  commit();
}

function trackLive(sessionId: string, delta: 1 | -1) {
  const n = (liveSessions.get(sessionId) ?? 0) + delta;
  if (n <= 0) liveSessions.delete(sessionId);
  else liveSessions.set(sessionId, n);
  if (liveSessions.size > 0 && !liveTimer) liveTimer = setInterval(liveTick, 15000);
  if (liveSessions.size === 0 && liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
}

// 每 15 秒檢查自動結束（模擬 pg_cron 每分鐘一次）
if (typeof window !== 'undefined') {
  setInterval(() => {
    if (applyAutoClose()) commit();
  }, 15000);
}

// ── 服務 ───────────────────────────────────────────────

export const mockServices: Services = {
  source: 'mock',

  auth: {
    async getViewer() {
      await delay(0, 30);
      return viewer();
    },
    async signIn(password) {
      await delay(300, 600);
      assertOnline();
      if (!password || password === 'wrong') throw new ServiceError('invalid_credentials');
      setCurrentStaff({ ...MOCK_ADMIN, email: 'admin@echo.local' });
      return viewer();
    },
    async signOut() {
      await delay(80, 150);
      setCurrentStaff(null);
      return viewer();
    },
  },

  sessions: {
    async listOpen() {
      await delay();
      assertOnline();
      if (applyAutoClose()) commit();
      return db()
        .sessions.filter((s) => s.status === 'open')
        .sort(byDateDesc)
        .map(summarize);
    },
    async listPast(offset, limit) {
      await delay();
      assertOnline();
      const all = db()
        .sessions.filter((s) => s.status === 'closed')
        .sort(byDateDesc);
      return {
        items: all.slice(offset, offset + limit).map(summarize),
        hasMore: offset + limit < all.length,
      };
    },
    async getByCode(code) {
      await delay();
      assertOnline();
      if (applyAutoClose()) commit();
      const s = db().sessions.find((x) => x.code === code.toUpperCase());
      return s && s.status !== 'draft' ? toSession(s) : null;
    },
    async findCurrent() {
      await delay();
      assertOnline();
      if (applyAutoClose()) commit();
      const s = db()
        .sessions.filter((x) => x.status === 'open')
        .sort(byDateDesc)[0];
      return s ? toSession(s) : null;
    },
    async listAll() {
      await delay();
      assertOnline();
      requireStaff();
      if (applyAutoClose()) commit();
      return [...db().sessions].sort(byDateDesc).map(summarize);
    },
    async getById(id) {
      await delay();
      assertOnline();
      requireStaff();
      const s = db().sessions.find((x) => x.id === id);
      return s ? toSession(s) : null;
    },
    async create(input, status) {
      await delay(300, 500);
      assertOnline();
      requireStaff();
      const taken = new Set(db().sessions.map((s) => s.code));
      const s: DbSession = {
        id: newId('session-'),
        code: genCode(taken),
        ...input,
        status,
        createdAt: new Date().toISOString(),
      };
      db().sessions.push(s);
      commit();
      return toSession(s);
    },
    async update(id, input) {
      await delay(300, 500);
      assertOnline();
      requireStaff();
      const s = findSession(id);
      Object.assign(s, input);
      commit();
      return toSession(s);
    },
    async setStatus(id, status) {
      await delay();
      assertOnline();
      requireStaff();
      const s = findSession(id);
      if (s.status === 'closed' && status === 'open') s.autoCloseAt = null;
      s.status = status;
      commit();
      return toSession(s);
    },
    async setAutoClose(id, autoCloseAt) {
      await delay();
      assertOnline();
      requireStaff();
      const s = findSession(id);
      s.autoCloseAt = autoCloseAt;
      commit();
      return toSession(s);
    },
    async remove(id) {
      await delay(300, 500);
      assertOnline();
      requireStaff();
      const d = db();
      const postIds = new Set(d.posts.filter((p) => p.sessionId === id).map((p) => p.id));
      d.sessions = d.sessions.filter((s) => s.id !== id);
      d.posts = d.posts.filter((p) => p.sessionId !== id);
      d.upvotes = d.upvotes.filter((u) => !postIds.has(u.postId));
      d.replies = d.replies.filter((r) => r.sessionId !== id);
      commit();
    },
    async recentSpeakers() {
      await delay(50, 120);
      const seen: string[] = [];
      for (const s of [...db().sessions].sort(byDateDesc)) {
        if (s.speaker && !seen.includes(s.speaker)) seen.push(s.speaker);
      }
      return seen;
    },
  },

  posts: {
    async listBySession(sessionId, opts) {
      await delay();
      assertOnline();
      const v = viewer();
      const includeHidden = !!opts?.includeHidden && !!v.staff;
      return db()
        .posts.filter((p) => p.sessionId === sessionId && (includeHidden || visibleToMember(p)))
        .map((p) => toPost(p, v.uid));
    },
    async create(sessionId, input) {
      await delay(250, 600);
      assertOnline();
      const v = viewer();
      const s = findSession(sessionId);
      if (!writable(s)) throw new ServiceError('session_closed');
      const body = input.body.trim();
      const nickname = input.nickname?.trim() || null;
      if (!body || body.length > LIMITS.postBody || (nickname?.length ?? 0) > LIMITS.nickname) {
        throw new ServiceError('invalid_input');
      }
      const since = Date.now() - 60000;
      const recent = db().posts.filter(
        (p) => p.authorId === v.uid && new Date(p.createdAt).getTime() > since,
      );
      if (recent.length >= LIMITS.postsPerMinute) throw new ServiceError('rate_limited');
      const p: DbPost = {
        id: newId('post-'),
        sessionId,
        authorId: v.uid,
        nickname,
        body,
        isHidden: false,
        hiddenByName: null,
        hiddenAt: null,
        createdAt: new Date().toISOString(),
      };
      db().posts.push(p);
      commit();
      return toPost(p, v.uid);
    },
    async setUpvote(postId, on) {
      await delay(80, 250);
      assertOnline();
      const v = viewer();
      const p = findPost(postId);
      if (!writable(findSession(p.sessionId))) throw new ServiceError('session_closed');
      const d = db();
      const has = d.upvotes.some((u) => u.postId === postId && u.userId === v.uid);
      if (on && !has) d.upvotes.push({ postId, userId: v.uid });
      if (!on && has)
        d.upvotes = d.upvotes.filter((u) => !(u.postId === postId && u.userId === v.uid));
      commit();
      return toPost(p, v.uid);
    },
    async setHidden(postId, hidden) {
      await delay(120, 250);
      assertOnline();
      const v = requireStaff();
      const p = findPost(postId);
      p.isHidden = hidden;
      p.hiddenByName = hidden ? v.staff.displayName : null;
      p.hiddenAt = hidden ? new Date().toISOString() : null;
      commit();
      return toPost(p, v.uid);
    },
    async remove(postId) {
      await delay(150, 300);
      assertOnline();
      requireStaff();
      findPost(postId);
      const d = db();
      d.posts = d.posts.filter((p) => p.id !== postId);
      d.upvotes = d.upvotes.filter((u) => u.postId !== postId);
      d.replies = d.replies.filter((r) => r.postId !== postId);
      commit();
    },
  },

  replies: {
    async create(postId, body, authorName) {
      await delay(250, 500);
      assertOnline();
      const v = requireStaff();
      const text = body.trim();
      const name = authorName.trim();
      if (!text || text.length > LIMITS.replyBody || name.length > LIMITS.replyAuthor)
        throw new ServiceError('invalid_input');
      const p = findPost(postId);
      const now = new Date().toISOString();
      const r: DbReply = {
        id: newId('reply-'),
        postId,
        sessionId: p.sessionId,
        authorKind: 'staff',
        authorId: v.uid,
        authorName: name || DEFAULT_REPLY_AUTHOR,
        body: text,
        isHidden: false,
        hiddenAt: null,
        editedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      db().replies.push(r);
      commit();
      return toReply(r);
    },
    async comment(postId, body, nickname) {
      await delay(250, 500);
      assertOnline();
      const v = viewer();
      const text = body.trim();
      const name = nickname.trim();
      if (!text || text.length > LIMITS.commentBody || name.length > LIMITS.nickname)
        throw new ServiceError('invalid_input');
      const p = findPost(postId);
      // 管理者在會友頁也是一般接續留言（AC10.9）
      if (p.isHidden || !writable(findSession(p.sessionId)))
        throw new ServiceError('session_closed');
      const since = Date.now() - 60000;
      const recent = db().replies.filter(
        (r) => r.authorId === v.uid && new Date(r.createdAt).getTime() > since,
      );
      if (recent.length >= LIMITS.postsPerMinute) throw new ServiceError('rate_limited');
      const now = new Date().toISOString();
      const r: DbReply = {
        id: newId('reply-'),
        postId,
        sessionId: p.sessionId,
        authorKind: 'member',
        authorId: v.uid,
        authorName: name || ANONYMOUS,
        body: text,
        isHidden: false,
        hiddenAt: null,
        editedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      db().replies.push(r);
      commit();
      return toReply(r);
    },
    async history(reply) {
      await delay(80, 200);
      assertOnline();
      const edits = db()
        .replyEdits.filter((e) => e.replyId === reply.id)
        .map((e) => ({ body: e.body, editedAt: e.editedAt }));
      return buildVersions(reply, edits);
    },
    async setHidden(replyId, hidden) {
      await delay(120, 250);
      assertOnline();
      requireStaff();
      const r = db().replies.find((x) => x.id === replyId);
      if (!r) throw new ServiceError('not_found');
      if (r.authorKind !== 'member') throw new ServiceError('forbidden');
      r.isHidden = hidden;
      r.hiddenAt = hidden ? new Date().toISOString() : null;
      r.updatedAt = new Date().toISOString();
      commit();
      return toReply(r);
    },
    async update(replyId, body) {
      await delay(250, 500);
      assertOnline();
      const v = requireStaff();
      const r = db().replies.find((x) => x.id === replyId);
      if (!r) throw new ServiceError('not_found');
      if (r.authorKind !== 'staff' || r.authorId !== v.uid) throw new ServiceError('forbidden');
      const text = body.trim();
      if (!text || text.length > LIMITS.replyBody) throw new ServiceError('invalid_input');
      // 內容真的有變才算編輯，留下編輯前的內容（spec AC6.6，同 DB trigger）
      if (text !== r.body) {
        const now = new Date().toISOString();
        db().replyEdits.push({ replyId: r.id, body: r.body, editedAt: now });
        r.body = text;
        r.editedAt = now;
      }
      r.updatedAt = new Date().toISOString();
      commit();
      return toReply(r);
    },
    async remove(replyId) {
      await delay();
      assertOnline();
      const v = requireStaff();
      const r = db().replies.find((x) => x.id === replyId);
      if (!r) throw new ServiceError('not_found');
      // 管理者可以刪除自己的回覆與會友的接續留言（AC7.5、AC10.7）
      if (r.authorKind === 'staff' && r.authorId !== v.uid) throw new ServiceError('forbidden');
      db().replies = db().replies.filter((x) => x.id !== replyId);
      commit();
    },
  },

  realtime: {
    subscribeSession(sessionId, opts, handlers: SessionEventHandlers) {
      // 以快照比對模擬 Realtime：任何變更後重新計算這個檢視者看得到的留言，送出差異
      let last = new Map<string, string>();
      let lastSession = '';

      const visiblePosts = () => {
        const v = viewer();
        const includeHidden = opts.includeHidden && !!v.staff;
        return db()
          .posts.filter((p) => p.sessionId === sessionId && (includeHidden || visibleToMember(p)))
          .map((p) => toPost(p, v.uid));
      };

      const snapshot = () => {
        const s = db().sessions.find((x) => x.id === sessionId);
        lastSession = JSON.stringify(s ?? null);
        last = new Map(visiblePosts().map((p) => [p.id, JSON.stringify(p)]));
      };

      const diff = () => {
        if (offline) return;
        const s = db().sessions.find((x) => x.id === sessionId);
        const sJson = JSON.stringify(s ?? null);
        if (sJson !== lastSession) {
          lastSession = sJson;
          handlers.onSessionChange(s ? toSession(s) : null);
        }
        const next = new Map<string, string>();
        for (const p of visiblePosts()) {
          const json = JSON.stringify(p);
          next.set(p.id, json);
          if (last.get(p.id) !== json) handlers.onPostUpsert(p);
        }
        for (const id of last.keys()) if (!next.has(id)) handlers.onPostRemoved(id);
        last = next;
      };

      const onConn = (state: ConnectionState) => {
        handlers.onConnection(state);
        if (state === 'connected') diff(); // 重連後重新同步（AC4.3）
      };

      snapshot();
      const offDb = onDbChange(() => setTimeout(diff, 150 + Math.random() * 400));
      connectionListeners.add(onConn);
      trackLive(sessionId, 1);
      if (offline) handlers.onConnection('disconnected');

      return () => {
        offDb();
        connectionListeners.delete(onConn);
        trackLive(sessionId, -1);
      };
    },
  },

  demo: {
    reset: resetDb,
    isLiveActivity: liveActivity,
    setLiveActivity,
    simulateDisconnect(seconds: number) {
      setOffline(true);
      setTimeout(() => setOffline(false), seconds * 1000);
    },
  },
};
