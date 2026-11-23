// Supabase 實作（tasks T020、T027、T106、T107；plan §5、§6）。
// 實作 services/types.ts 同一組介面；元件與 store 不知道背後是 mock 還是 Supabase。
// 權限全部由 RLS 保證（supabase/migrations），這裡的檢查只是為了給較好的錯誤訊息。

import { REALTIME_SUBSCRIBE_STATES, createClient, type User } from '@supabase/supabase-js';
import type { Post, Session, SessionSummary, Viewer } from '@/types/models';
import { DEFAULT_REPLY_AUTHOR, LIMITS } from '@/types/models';
import { ServiceError } from '../types';
import type { ConnectionState, Services, SessionEventHandlers } from '../types';
import { check, toServiceError } from './errors';
import {
  POST_COLUMNS,
  REPLY_COLUMNS,
  SESSION_COLUMNS,
  type PostRow,
  type ReplyRow,
  type SessionCountRow,
  type SessionRow,
  newUuid,
  toPost,
  toReply,
  toSession,
  toSummary,
} from './rows';

/**
 * 管理端只輸入密碼（spec D14），實際上登入一個共用的管理帳號。
 * Supabase 密碼至少 6 碼，所以帳號的實際密碼是「echo-」加上輸入的密碼（supabase/README.md）。
 */
const ADMIN_EMAIL = import.meta.env.QCLI_ADMIN_EMAIL || 'admin@echo.local';
const PASSWORD_PREFIX = 'echo-';

export function createSupabaseServices(url: string, key: string): Services {
  const db = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'echo.auth' },
  });

  // ── 身分 ─────────────────────────────────────────────

  async function currentUser(): Promise<User | null> {
    const { data } = await db.auth.getSession();
    return data.session?.user ?? null;
  }

  let signingIn: Promise<User> | null = null;

  /** 會友第一次需要身分時，在背景建立匿名身分（AC1.4）；同一瀏覽器之後都是同一個 */
  async function ensureUser(): Promise<User> {
    const u = await currentUser();
    if (u) return u;
    signingIn ??= db.auth
      .signInAnonymously()
      .then(({ data, error }) => {
        if (error || !data.user) throw toServiceError(error);
        return data.user;
      })
      .finally(() => (signingIn = null));
    return signingIn;
  }

  async function uid(): Promise<string | null> {
    return (await currentUser())?.id ?? null;
  }

  async function staffName(user: User): Promise<string | null> {
    if (user.is_anonymous) return null;
    const row = check<{ display_name: string } | null>(
      await db
        .from('staff_members')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle<{ display_name: string }>(),
    );
    return row?.display_name ?? null;
  }

  async function viewerOf(user: User): Promise<Viewer> {
    const name = await staffName(user);
    return { uid: user.id, staff: name ? { displayName: name } : null };
  }

  // ── 查詢 ─────────────────────────────────────────────

  async function summaries(rows: SessionRow[]): Promise<SessionSummary[]> {
    if (rows.length === 0) return [];
    // 未產生 DB 型別前，rpc 的回傳型別由這裡指定（T016 之後改用產生的型別）
    const counts = check<SessionCountRow[]>(
      await db.rpc('session_counts', { ids: rows.map((r) => r.id) }),
    );
    const byId = new Map(counts.map((c) => [c.session_id, c]));
    return rows.map((r) => toSummary(r, byId.get(r.id)));
  }

  const sessionsQuery = () =>
    db
      .from('sessions')
      .select(SESSION_COLUMNS)
      .order('sermon_date', { ascending: false })
      .order('created_at', { ascending: false });

  async function sessionById(id: string): Promise<Session | null> {
    const row = check<SessionRow | null>(
      await db.from('sessions').select(SESSION_COLUMNS).eq('id', id).maybeSingle<SessionRow>(),
    );
    return row ? toSession(row) : null;
  }

  async function updateSession(id: string, patch: Record<string, unknown>): Promise<Session> {
    const row = check(
      await db
        .from('sessions')
        .update(patch)
        .eq('id', id)
        .select(SESSION_COLUMNS)
        .single<SessionRow>(),
    );
    return toSession(row);
  }

  /** 最近讀到的留言；即時事件只帶附議數變動時，直接套用而不必重新查詢 */
  const known = new Map<string, Post>();

  function remember(p: Post): Post {
    known.set(p.id, p);
    return p;
  }

  async function fetchPost(id: string): Promise<Post | null> {
    const row = check<PostRow | null>(
      await db.from('posts').select(POST_COLUMNS).eq('id', id).maybeSingle<PostRow>(),
    );
    if (!row) {
      known.delete(id);
      return null;
    }
    return remember(toPost(row, await uid()));
  }

  async function requirePost(id: string): Promise<Post> {
    const p = await fetchPost(id);
    if (!p) throw new ServiceError('not_found');
    return p;
  }

  async function listPosts(sessionId: string, includeHidden: boolean): Promise<Post[]> {
    let q = db.from('posts').select(POST_COLUMNS).eq('session_id', sessionId);
    if (!includeHidden) q = q.eq('is_hidden', false);
    const rows = check(await q.returns<PostRow[]>());
    const me = await uid();
    return rows.map((r) => remember(toPost(r, me)));
  }

  // ── 連線狀態 ─────────────────────────────────────────

  let online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const onlineListeners = new Set<(on: boolean) => void>();
  if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => {
      online = false;
      onlineListeners.forEach((fn) => fn(false));
    });
    window.addEventListener('online', () => {
      online = true;
      onlineListeners.forEach((fn) => fn(true));
    });
  }

  // ── 服務 ─────────────────────────────────────────────

  return {
    source: 'supabase',
    demo: null,

    auth: {
      async getViewer() {
        try {
          return await viewerOf(await ensureUser());
        } catch (e) {
          throw toServiceError(e);
        }
      },
      async signIn(password) {
        const { data, error } = await db.auth.signInWithPassword({
          email: ADMIN_EMAIL,
          password: PASSWORD_PREFIX + password,
        });
        if (error || !data.user) {
          const se = toServiceError(error);
          throw se.code === 'network' ? se : new ServiceError('invalid_credentials');
        }
        const v = await viewerOf(data.user);
        if (!v.staff) {
          await db.auth.signOut();
          throw new ServiceError('not_staff');
        }
        known.clear();
        return v;
      },
      async signOut() {
        await db.auth.signOut();
        known.clear();
        return viewerOf(await ensureUser());
      },
    },

    sessions: {
      async listOpen() {
        const rows = check(await sessionsQuery().eq('status', 'open').returns<SessionRow[]>());
        return summaries(rows);
      },
      async listPast(offset, limit) {
        const rows = check(
          await sessionsQuery()
            .eq('status', 'closed')
            .range(offset, offset + limit) // 多拿一筆判斷還有沒有下一頁
            .returns<SessionRow[]>(),
        );
        return { items: await summaries(rows.slice(0, limit)), hasMore: rows.length > limit };
      },
      async getByCode(code) {
        const row = check<SessionRow | null>(
          await db
            .from('sessions')
            .select(SESSION_COLUMNS)
            .eq('code', code.trim().toUpperCase())
            .neq('status', 'draft')
            .maybeSingle<SessionRow>(),
        );
        return row ? toSession(row) : null;
      },
      async findCurrent() {
        const rows = check(
          await sessionsQuery().eq('status', 'open').limit(1).returns<SessionRow[]>(),
        );
        return rows[0] ? toSession(rows[0]) : null;
      },
      async listAll() {
        return summaries(check(await sessionsQuery().returns<SessionRow[]>()));
      },
      getById: sessionById,
      async create(input, status) {
        const row = check(
          await db
            .from('sessions')
            .insert({
              title: input.title,
              speaker: input.speaker,
              scripture: input.scripture,
              sermon_date: input.sermonDate,
              auto_close_at: input.autoCloseAt,
              status,
            })
            .select(SESSION_COLUMNS)
            .single<SessionRow>(),
        );
        return toSession(row);
      },
      update(id, input) {
        return updateSession(id, {
          title: input.title,
          speaker: input.speaker,
          scripture: input.scripture,
          sermon_date: input.sermonDate,
          auto_close_at: input.autoCloseAt,
        });
      },
      // 重新開放時由 DB trigger 清除自動結束時間（AC5.9）
      setStatus: (id, status) => updateSession(id, { status }),
      setAutoClose: (id, autoCloseAt) => updateSession(id, { auto_close_at: autoCloseAt }),
      // 刪除＝封存（spec D20）：只填 deleted_at，資料保留
      async remove(id) {
        check(await db.rpc('archive_session', { p_id: id }));
      },
      async recentSpeakers() {
        const rows = check(
          await db
            .from('sessions')
            .select('speaker')
            .not('speaker', 'is', null)
            .order('sermon_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(100)
            .returns<{ speaker: string }[]>(),
        );
        return [...new Set(rows.map((r) => r.speaker))];
      },
    },

    posts: {
      listBySession(sessionId, opts) {
        return listPosts(sessionId, !!opts?.includeHidden);
      },
      async create(sessionId, input) {
        const body = input.body.trim();
        const nickname = input.nickname?.trim() || null;
        if (!body || body.length > LIMITS.postBody || (nickname?.length ?? 0) > LIMITS.nickname) {
          throw new ServiceError('invalid_input');
        }
        await ensureUser();
        const id = newUuid();
        check(await db.from('posts').insert({ id, session_id: sessionId, nickname, body }));
        return requirePost(id);
      },
      async setUpvote(postId, on) {
        await ensureUser();
        // 先記住自己的附議狀態，避免即時事件比 RPC 早回來時畫面閃一下
        const prev = known.get(postId);
        if (prev) known.set(postId, { ...prev, upvotedByMe: on });
        try {
          check(await db.rpc('set_upvote', { p_post: postId, p_on: on }));
        } catch (e) {
          if (prev) known.set(postId, prev);
          throw e;
        }
        return requirePost(postId);
      },
      async setHidden(postId, hidden) {
        check(await db.from('posts').update({ is_hidden: hidden }).eq('id', postId));
        return requirePost(postId);
      },
      // 刪除＝封存（spec D20）；trigger 廣播 post_removed 給所有開著的畫面
      async remove(postId) {
        check(await db.rpc('archive_post', { p_id: postId }));
        known.delete(postId);
      },
    },

    replies: {
      async create(postId, body, authorName) {
        const text = body.trim();
        const name = authorName.trim();
        if (!text || text.length > LIMITS.replyBody || name.length > LIMITS.replyAuthor)
          throw new ServiceError('invalid_input');
        const row = check(
          await db
            .from('replies')
            .insert({ post_id: postId, body: text, author_name: name || DEFAULT_REPLY_AUTHOR })
            .select(REPLY_COLUMNS)
            .single<ReplyRow>(),
        );
        return toReply(row);
      },
      // 接續留言（spec US10）：同一張表，DB 依身分決定是會友接續留言或牧者回覆
      async comment(postId, body, nickname) {
        const text = body.trim();
        const name = nickname.trim();
        if (!text || text.length > LIMITS.commentBody || name.length > LIMITS.nickname)
          throw new ServiceError('invalid_input');
        await ensureUser();
        const row = check(
          await db
            .from('replies')
            .insert({ post_id: postId, body: text, author_name: name || null })
            .select(REPLY_COLUMNS)
            .single<ReplyRow>(),
        );
        return toReply(row);
      },
      async setHidden(replyId, hidden) {
        const row = check(
          await db
            .from('replies')
            .update({ is_hidden: hidden })
            .eq('id', replyId)
            .select(REPLY_COLUMNS)
            .single<ReplyRow>(),
        );
        return toReply(row);
      },
      async update(replyId, body) {
        const text = body.trim();
        if (!text || text.length > LIMITS.replyBody) throw new ServiceError('invalid_input');
        const row = check(
          await db
            .from('replies')
            .update({ body: text })
            .eq('id', replyId)
            .select(REPLY_COLUMNS)
            .single<ReplyRow>(),
        );
        return toReply(row);
      },
      // 刪除＝封存（spec D20）；posts.reply_count 的 UPDATE 會讓開著的畫面重新讀取
      async remove(replyId) {
        check(await db.rpc('archive_reply', { p_id: replyId }));
      },
    },

    realtime: {
      subscribeSession(sessionId, opts, handlers: SessionEventHandlers) {
        const { includeHidden } = opts;
        const sessionFilter = `session_id=eq.${sessionId}`;
        const timers = new Map<string, ReturnType<typeof setTimeout>>();
        let closed = false;
        let everSubscribed = false;
        let state: ConnectionState = online ? 'connected' : 'disconnected';

        const setState = (s: ConnectionState) => {
          if (s === state) return;
          state = s;
          handlers.onConnection(s);
        };

        async function reloadPost(id: string) {
          try {
            const p = await fetchPost(id);
            if (closed) return;
            if (!p || (!includeHidden && p.isHidden)) handlers.onPostRemoved(id);
            else handlers.onPostUpsert(p);
          } catch {
            // 網路錯誤：等重新連線後整體同步
          }
        }

        /** 同一則留言短時間內的多個事件（附議數＋回覆）合併成一次查詢 */
        function refresh(id: string) {
          clearTimeout(timers.get(id));
          timers.set(
            id,
            setTimeout(() => {
              timers.delete(id);
              void reloadPost(id);
            }, 250),
          );
        }

        /** 重新連線後重新抓取完整列表（AC4.3） */
        async function resync() {
          try {
            const s = await sessionById(sessionId);
            if (closed) return;
            handlers.onSessionChange(s && (includeHidden || s.status !== 'draft') ? s : null);
            if (!s) return;
            const list = await listPosts(sessionId, includeHidden);
            if (closed) return;
            const ids = new Set(list.map((p) => p.id));
            list.forEach((p) => handlers.onPostUpsert(p));
            for (const [id, p] of known) {
              if (p.sessionId === sessionId && !ids.has(id)) {
                known.delete(id);
                handlers.onPostRemoved(id);
              }
            }
          } catch {
            // 下次重新連線時再試
          }
        }

        const channel = db
          .channel(`session:${sessionId}`)
          .on<SessionRow>(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
            ({ new: row }) => handlers.onSessionChange(toSession(row)),
          )
          .on<SessionRow>(
            'postgres_changes',
            // DELETE 事件不能用 filter，自己比對 id
            { event: 'DELETE', schema: 'public', table: 'sessions' },
            ({ old }) => {
              if (old.id === sessionId) handlers.onSessionChange(null);
            },
          )
          .on<PostRow>(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'posts', filter: sessionFilter },
            ({ new: row }) => refresh(row.id),
          )
          .on<PostRow>(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'posts', filter: sessionFilter },
            ({ new: row }) => {
              const prev = known.get(row.id);
              // 只有附議數變了：直接套用，不必每個人都重新查詢。
              // 接續留言被隱藏後會友讀不到那一列，靠 comment_count 變動得知要重新讀取（plan §5）
              const staffReplies = prev?.replies.filter((r) => r.authorKind === 'staff').length;
              const comments = prev?.replies.filter(
                (r) => r.authorKind === 'member' && !r.isHidden,
              ).length;
              if (
                prev &&
                typeof row.upvote_count === 'number' &&
                row.reply_count === staffReplies &&
                row.comment_count === comments &&
                row.is_hidden === prev.isHidden
              ) {
                handlers.onPostUpsert(remember({ ...prev, upvoteCount: row.upvote_count }));
                return;
              }
              refresh(row.id);
            },
          )
          .on<ReplyRow>(
            'postgres_changes',
            // 回覆刪除由 posts.reply_count 的 UPDATE 事件處理
            { event: '*', schema: 'public', table: 'replies', filter: sessionFilter },
            ({ new: row }) => {
              if (row && 'post_id' in row && row.post_id) refresh(row.post_id);
            },
          )
          // 場次被刪除（封存）：RLS 讓所有人都讀不到，改由 DB 廣播（spec D20）
          .on('broadcast', { event: 'session_removed' }, () => handlers.onSessionChange(null))
          .on('broadcast', { event: 'post_removed' }, ({ payload }) => {
            const id = (payload as { post_id?: string } | undefined)?.post_id;
            if (!id) return;
            if (includeHidden) refresh(id);
            else {
              known.delete(id);
              handlers.onPostRemoved(id);
            }
          })
          .subscribe((status) => {
            if (closed) return;
            if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
              const reconnected = everSubscribed;
              everSubscribed = true;
              setState('connected');
              if (reconnected) void resync();
            } else {
              setState('disconnected');
            }
          });

        const onOnline = (on: boolean) => {
          if (!on) setState('disconnected');
        };
        onlineListeners.add(onOnline);
        if (state === 'disconnected') handlers.onConnection('disconnected');

        return () => {
          closed = true;
          timers.forEach(clearTimeout);
          onlineListeners.delete(onOnline);
          void db.removeChannel(channel);
        };
      },
    },
  };
}
