// 單一場次的留言板：會友端（M2）、管理端（A4）、講台模式（A7）共用。
// 負責：載入、排序／篩選、樂觀附議、合併即時事件、不跳動插入（ux.md §6）。

import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { services } from '@/services';
import type { ConnectionState } from '@/services/types';
import type { Post, PostInput, Session } from '@/types/models';
import {
  type PostFilter,
  type PostSort,
  countByFilter,
  insertionIndex,
  isOrderStale,
  matchesFilter,
  sortPosts,
} from '@/utils/sortFilter';
import { tickClock, useClock } from '@/composables/useClock';

export type BoardMode = 'member' | 'admin';
export type BoardStatus = 'idle' | 'loading' | 'ready' | 'not_found' | 'error';

const PREF_KEY = (mode: BoardMode) => `echo.board.${mode}`;

function loadPrefs(mode: BoardMode): { sort: PostSort; filter: PostFilter } {
  const fallback =
    mode === 'admin'
      ? { sort: 'top' as PostSort, filter: 'all' as PostFilter } // A4 預設「全部＋最多附議」（D13）
      : { sort: 'newest' as PostSort, filter: 'all' as PostFilter };
  try {
    const raw = sessionStorage.getItem(PREF_KEY(mode));
    return raw ? { ...fallback, ...(JSON.parse(raw) as object) } : fallback;
  } catch {
    return fallback;
  }
}

export const useBoardStore = defineStore('board', () => {
  const mode = ref<BoardMode>('member');
  const status = ref<BoardStatus>('idle');
  const session = ref<Session | null>(null);
  const posts = ref<Record<string, Post>>({});
  /** 畫面上的順序（含所有留言，篩選在 visible 計算） */
  const orderIds = ref<string[]>([]);
  /** 使用者往下捲時進來的新留言，等點「↑ N 則新留言」再插入 */
  const pendingNewIds = ref<string[]>([]);
  const sort = ref<PostSort>('newest');
  const filter = ref<PostFilter>('all');
  const connection = ref<ConnectionState>('connected');
  const atTop = ref(true);
  /** 講台模式的順序快照（AC9.3：沿用進入時的篩選與排序） */
  const stageIds = ref<string[]>([]);
  const stageActive = ref(false);

  const clock = useClock();
  let unsubscribe: (() => void) | null = null;
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  // ── 衍生狀態

  const get = (id: string) => posts.value[id];
  const all = computed(() => Object.values(posts.value));

  const visible = computed(() =>
    orderIds.value.map(get).filter((p): p is Post => !!p && matchesFilter(p, filter.value)),
  );

  const counts = computed(() => countByFilter(all.value));

  const newCount = computed(
    () =>
      pendingNewIds.value.filter((id) => {
        const p = get(id);
        return p && matchesFilter(p, filter.value);
      }).length,
  );

  /** 「最多附議」下附議數變了但不即時重排（ux.md §6.2） */
  const orderStale = computed(() => sort.value === 'top' && isOrderStale(visible.value, 'top'));

  /** 可留言／附議：開放中且未到自動結束時間（與 DB 的 session_is_writable 相同） */
  const writable = computed(() => {
    const s = session.value;
    if (!s || s.status !== 'open') return false;
    return !s.autoCloseAt || clock.value < new Date(s.autoCloseAt).getTime();
  });

  const stagePosts = computed(() =>
    stageIds.value
      .map(get)
      .filter((p): p is Post => !!p && (filter.value === 'hidden' || !p.isHidden)),
  );

  // ── 順序操作

  function refreshOrder() {
    orderIds.value = sortPosts(all.value, sort.value).map((p) => p.id);
    pendingNewIds.value = [];
  }

  function insertSorted(id: string) {
    const p = get(id);
    if (!p) return;
    const order = orderIds.value.map(get).filter((x): x is Post => !!x);
    orderIds.value.splice(insertionIndex(order, p, sort.value), 0, id);
  }

  function flushPending() {
    const ids = pendingNewIds.value;
    pendingNewIds.value = [];
    ids.forEach(insertSorted);
  }

  function upsert(p: Post, opts: { own?: boolean } = {}) {
    const isNew = !posts.value[p.id];
    posts.value[p.id] = p;
    if (orderIds.value.includes(p.id) || pendingNewIds.value.includes(p.id)) return;
    // 自己的留言送出後直接出現在最上方；「最舊」排序則照順序放在最下方
    if (opts.own && sort.value !== 'oldest') orderIds.value.unshift(p.id);
    // 「最舊」排序的新留言加在最下方，不會推動正在看的內容，所以直接插入、不顯示「↑ N 則新留言」
    else if (!isNew || atTop.value || sort.value === 'oldest') insertSorted(p.id);
    else pendingNewIds.value.push(p.id);
    if (isNew && stageActive.value && matchesFilter(p, filter.value)) stageIds.value.push(p.id);
  }

  function removeLocal(id: string) {
    delete posts.value[id];
    orderIds.value = orderIds.value.filter((x) => x !== id);
    pendingNewIds.value = pendingNewIds.value.filter((x) => x !== id);
  }

  watch(atTop, (top) => {
    if (top && pendingNewIds.value.length) flushPending();
  });

  watch([sort, filter], () => {
    try {
      sessionStorage.setItem(
        PREF_KEY(mode.value),
        JSON.stringify({ sort: sort.value, filter: filter.value }),
      );
    } catch {
      // 存不了就算了
    }
  });

  watch(sort, refreshOrder);

  // ── 自動結束：前端自己計時，不等伺服器排程（ux.md M4）

  function scheduleAutoClose() {
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
    const at = session.value?.autoCloseAt;
    if (!at || session.value?.status !== 'open') return;
    const ms = new Date(at).getTime() - Date.now();
    if (ms > 0 && ms < 2 ** 31 - 1) autoCloseTimer = setTimeout(tickClock, ms + 50);
  }

  // ── 載入與訂閱

  function reset() {
    unsubscribe?.();
    unsubscribe = null;
    session.value = null;
    posts.value = {};
    orderIds.value = [];
    pendingNewIds.value = [];
    stageIds.value = [];
    stageActive.value = false;
    connection.value = 'connected';
    atTop.value = true;
  }

  async function open(target: { code?: string; id?: string }, nextMode: BoardMode) {
    const current = session.value;
    const same =
      current &&
      mode.value === nextMode &&
      (target.code ? current.code === target.code : current.id === target.id);
    if (same && status.value === 'ready') return; // 留言板 ↔ 講台模式切換時不重新載入

    reset();
    mode.value = nextMode;
    ({ sort: sort.value, filter: filter.value } = loadPrefs(nextMode));
    if (nextMode === 'member' && filter.value === 'hidden') filter.value = 'all';
    status.value = 'loading';

    try {
      const s = target.code
        ? await services.sessions.getByCode(target.code)
        : await services.sessions.getById(target.id ?? '');
      if (!s) {
        status.value = 'not_found';
        return;
      }
      session.value = s;
      const list = await services.posts.listBySession(s.id, {
        includeHidden: nextMode === 'admin',
      });
      posts.value = Object.fromEntries(list.map((p) => [p.id, p]));
      refreshOrder();
      status.value = 'ready';
      scheduleAutoClose();
      subscribe(s.id, nextMode);
    } catch {
      status.value = 'error';
    }
  }

  function subscribe(sessionId: string, m: BoardMode) {
    unsubscribe = services.realtime.subscribeSession(
      sessionId,
      { includeHidden: m === 'admin' },
      {
        onPostUpsert: (p) => upsert(p),
        onPostRemoved: removeLocal,
        onSessionChange: (s) => {
          if (!s || (m === 'member' && s.status === 'draft')) {
            status.value = 'not_found';
            return;
          }
          session.value = s;
          scheduleAutoClose();
        },
        onConnection: (state) => (connection.value = state),
      },
    );
  }

  function close() {
    reset();
    status.value = 'idle';
  }

  // ── 會友動作

  async function createPost(input: PostInput) {
    if (!session.value) return;
    const p = await services.posts.create(session.value.id, input);
    upsert(p, { own: true });
  }

  /** 樂觀更新：先 +1，失敗時還原（ux.md §6.3） */
  async function toggleUpvote(id: string) {
    const before = get(id);
    if (!before) return;
    const on = !before.upvotedByMe;
    posts.value[id] = {
      ...before,
      upvotedByMe: on,
      upvoteCount: before.upvoteCount + (on ? 1 : -1),
    };
    try {
      posts.value[id] = await services.posts.setUpvote(id, on);
    } catch (e) {
      if (get(id)) posts.value[id] = before;
      throw e;
    }
  }

  // ── 管理動作

  async function setHidden(id: string, hidden: boolean) {
    const p = await services.posts.setHidden(id, hidden);
    posts.value[id] = p;
  }

  /** 永久刪除（spec D15）；不做樂觀更新，成功才從畫面移除 */
  async function deletePost(id: string) {
    await services.posts.remove(id);
    removeLocal(id);
    stageIds.value = stageIds.value.filter((x) => x !== id);
  }

  async function addReply(postId: string, body: string, authorName: string) {
    const r = await services.replies.create(postId, body, authorName);
    const p = get(postId);
    if (p && !p.replies.some((x) => x.id === r.id))
      posts.value[postId] = { ...p, replies: [...p.replies, r] };
  }

  async function updateReply(postId: string, replyId: string, body: string) {
    const r = await services.replies.update(replyId, body);
    const p = get(postId);
    if (p)
      posts.value[postId] = { ...p, replies: p.replies.map((x) => (x.id === replyId ? r : x)) };
  }

  async function deleteReply(postId: string, replyId: string) {
    await services.replies.remove(replyId);
    const p = get(postId);
    if (p) posts.value[postId] = { ...p, replies: p.replies.filter((x) => x.id !== replyId) };
  }

  function setSession(s: Session) {
    session.value = s;
    scheduleAutoClose();
  }

  // ── 講台模式

  function startStage() {
    stageIds.value = visible.value.map((p) => p.id);
    stageActive.value = true;
  }

  function ensureStageIncludes(id: string) {
    if (!stageActive.value) startStage();
    if (!stageIds.value.includes(id) && get(id)) stageIds.value.unshift(id);
  }

  function endStage() {
    stageActive.value = false;
  }

  return {
    mode,
    status,
    session,
    posts,
    sort,
    filter,
    connection,
    atTop,
    visible,
    counts,
    newCount,
    orderStale,
    writable,
    stagePosts,
    stageActive,
    get,
    open,
    close,
    refreshOrder,
    flushPending,
    createPost,
    toggleUpvote,
    setHidden,
    deletePost,
    addReply,
    updateReply,
    deleteReply,
    setSession,
    startStage,
    ensureStageIncludes,
    endStage,
  };
});
