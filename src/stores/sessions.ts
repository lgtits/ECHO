// 場次列表：會友首頁（M1）與管理端列表／側欄（A2）。
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { services } from '@/services';
import type { Session, SessionInput, SessionStatus, SessionSummary } from '@/types/models';
import { LIMITS } from '@/types/models';

export const useSessionsStore = defineStore('sessions', () => {
  // ── 會友首頁
  const openSessions = ref<SessionSummary[]>([]);
  const pastSessions = ref<SessionSummary[]>([]);
  const pastHasMore = ref(false);
  const publicLoaded = ref(false);

  async function loadPublic() {
    const [open, past] = await Promise.all([
      services.sessions.listOpen(),
      services.sessions.listPast(0, LIMITS.pastPageSize),
    ]);
    openSessions.value = open;
    pastSessions.value = past.items;
    pastHasMore.value = past.hasMore;
    publicLoaded.value = true;
  }

  async function loadMorePast() {
    const page = await services.sessions.listPast(pastSessions.value.length, LIMITS.pastPageSize);
    pastSessions.value.push(...page.items);
    pastHasMore.value = page.hasMore;
  }

  // ── 管理端
  const all = ref<SessionSummary[]>([]);
  const adminLoaded = ref(false);

  /** 開放中置頂，其餘依日期由新到舊（AC5.5、ux.md A2） */
  const adminSorted = computed(() => [
    ...all.value.filter((s) => s.status === 'open'),
    ...all.value.filter((s) => s.status !== 'open'),
  ]);

  async function loadAdmin() {
    all.value = await services.sessions.listAll();
    adminLoaded.value = true;
  }

  async function create(input: SessionInput, status: Extract<SessionStatus, 'draft' | 'open'>) {
    const s = await services.sessions.create(input, status);
    void loadAdmin();
    return s;
  }

  async function update(id: string, input: SessionInput) {
    const s = await services.sessions.update(id, input);
    void loadAdmin();
    return s;
  }

  async function setStatus(id: string, status: SessionStatus): Promise<Session> {
    const s = await services.sessions.setStatus(id, status);
    void loadAdmin();
    return s;
  }

  async function setAutoClose(id: string, at: string | null): Promise<Session> {
    const s = await services.sessions.setAutoClose(id, at);
    void loadAdmin();
    return s;
  }

  async function remove(id: string) {
    await services.sessions.remove(id);
    await loadAdmin();
  }

  return {
    openSessions,
    pastSessions,
    pastHasMore,
    publicLoaded,
    loadPublic,
    loadMorePast,
    all,
    adminSorted,
    adminLoaded,
    loadAdmin,
    create,
    update,
    setStatus,
    setAutoClose,
    remove,
    getByCode: (code: string) => services.sessions.getByCode(code),
    getById: (id: string) => services.sessions.getById(id),
    findCurrent: () => services.sessions.findCurrent(),
    recentSpeakers: () => services.sessions.recentSpeakers(),
  };
});
