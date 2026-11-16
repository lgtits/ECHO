<script setup lang="ts">
// A4 場次管理（ux.md A4、A3 ③、A5、A6；AC5.3–5.9、AC6.x、AC7.x）。
// ≥ 1024px 左右兩欄（列表＋回覆面板）；以下單欄，回覆開對話框。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { copyToClipboard, useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import { useBoardStore } from '@/stores/board';
import { useSessionsStore } from '@/stores/sessions';
import { useBreakpoint } from '@/composables/useBreakpoint';
import PostCard from '@/components/PostCard.vue';
import ReplyEditor from '@/components/ReplyEditor.vue';
import ReplySheet from '@/components/ReplySheet.vue';
import QrShareDialog from '@/components/QrShareDialog.vue';
import QrImage from '@/components/QrImage.vue';
import QrProjector from '@/components/QrProjector.vue';
import FilterTabs from '@/components/FilterTabs.vue';
import { ADMIN_FILTERS, ADMIN_SORTS } from '@/utils/sortFilter';
import { buildSessionUrl } from '@/utils/sessionUrl';
import { displayUrl, siteUrl } from '@/utils/config';
import { errorMessage } from '@/utils/errors';
import { formatHm, formatShortDate, parseDate } from '@/utils/time';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const board = useBoardStore();
const sessions = useSessionsStore();
const { isDesktop, isPhone } = useBreakpoint();

const id = computed(() => String(route.params.id ?? ''));
const s = computed(() => board.session);
const url = computed(() => (s.value ? buildSessionUrl(siteUrl(), s.value.code) : ''));

const shareOpen = ref(false);
const projecting = ref(false);
const statusBusy = ref(false);
const replyId = ref<string | null>(null);
const replyDialog = ref(false);
const heroHidden = ref(false);

const showHero = computed(() => route.query.created === '1' && !heroHidden.value);
const replyPost = computed(() => (replyId.value ? (board.get(replyId.value) ?? null) : null));
const showPanel = computed(() => isDesktop.value);

const statusText = computed(() => {
  const x = s.value;
  if (!x) return '';
  if (x.status === 'draft') return '草稿';
  if (!board.writable) return '已結束 · 仍可補充回覆';
  return x.autoCloseAt ? `開放中 · ${formatHm(new Date(x.autoCloseAt))} 自動結束` : '開放中';
});
const dotClass = computed(() => {
  if (s.value?.status === 'draft') return 'status-dot--draft';
  return board.writable ? 'status-dot--open' : '';
});

async function load() {
  replyId.value = null;
  heroHidden.value = false;
  await board.open({ id: id.value }, 'admin');
}

watch(id, load);
onMounted(() => {
  void load();
  window.addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));

function onScroll() {
  board.atTop = window.scrollY < 160;
}

// ── 場次狀態

async function setStatus(next: 'open' | 'closed') {
  if (!s.value) return;
  statusBusy.value = true;
  try {
    board.setSession(await sessions.setStatus(s.value.id, next));
    $q.notify({ message: next === 'open' ? '已開放留言' : '已結束留言' });
  } catch (e) {
    $q.notify({ message: errorMessage(e) });
  } finally {
    statusBusy.value = false;
  }
}

/** 「結束留言」需要確認；「開放留言」不需要（ux.md A4） */
function endSession() {
  $q.dialog({
    title: '結束留言？',
    message: '結束後會友只能瀏覽，不能再留言或附議。你之後仍可補充回覆，也可以重新開放。',
    cancel: { label: '取消', flat: true, noCaps: true, color: 'dark' },
    ok: { label: '結束留言', flat: true, noCaps: true, color: 'negative' },
  }).onOk(() => void setStatus('closed'));
}

function autoCloseDialog() {
  if (!s.value) return;
  const current = s.value.autoCloseAt ? formatHm(new Date(s.value.autoCloseAt)) : '';
  const items = [{ label: '不自動結束', value: '' }];
  for (let i = 24; i < 96; i++) {
    const t = `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`;
    items.push({ label: t, value: t });
  }
  $q.dialog({
    title: '設定自動結束',
    message: '到時間後自動結束留言（場次當天）。',
    options: { type: 'radio', model: current, items },
    cancel: { label: '取消', flat: true, noCaps: true, color: 'dark' },
    ok: { label: '儲存', flat: true, noCaps: true, color: 'primary' },
  }).onOk((value: string) => void saveAutoClose(value));
}

async function saveAutoClose(value: string) {
  if (!s.value) return;
  let iso: string | null = null;
  if (value) {
    const d = parseDate(s.value.sermonDate);
    const [h, m] = value.split(':').map(Number);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    iso = d.toISOString();
  }
  try {
    board.setSession(await sessions.setAutoClose(s.value.id, iso));
    $q.notify({ message: iso ? `將於 ${value} 自動結束` : '已取消自動結束' });
  } catch (e) {
    $q.notify({ message: errorMessage(e) });
  }
}

function removeSession() {
  if (!s.value) return;
  const title = s.value.title;
  $q.dialog({
    title: '刪除場次',
    message: `場次與所有留言、回覆都會永久刪除，無法復原。請輸入場次標題「${title}」確認。`,
    prompt: { model: '', type: 'text', isValid: (v: string) => v.trim() === title },
    cancel: { label: '取消', flat: true, noCaps: true, color: 'dark' },
    ok: { label: '永久刪除', flat: true, noCaps: true, color: 'negative' },
  }).onOk(() => void doRemove());
}

async function doRemove() {
  try {
    await sessions.remove(id.value);
    board.close();
    $q.notify({ message: '已刪除場次' });
    await router.push('/admin');
  } catch (e) {
    $q.notify({ message: errorMessage(e) });
  }
}

async function copyLink() {
  try {
    await copyToClipboard(url.value);
    $q.notify({ message: '已複製連結' });
  } catch {
    $q.notify({ message: '無法複製，請手動選取網址' });
  }
}

// ── 留言操作

function openReply(postId: string) {
  replyId.value = postId;
  if (!showPanel.value) replyDialog.value = true;
}

/** 隱藏不跳確認，改用 5 秒內可復原（AC7.3） */
async function hide(postId: string, hidden: boolean) {
  try {
    await board.setHidden(postId, hidden);
    if (replyId.value === postId && hidden) replyId.value = null;
    $q.notify({
      message: hidden ? '已隱藏' : '已取消隱藏',
      timeout: 5000,
      actions: hidden
        ? [
            {
              label: '復原',
              color: 'white',
              noCaps: true,
              handler: () => void board.setHidden(postId, false),
            },
          ]
        : [],
    });
  } catch (e) {
    $q.notify({ message: errorMessage(e) });
  }
}

/** 永久刪除無法復原，一定先確認（AC7.4；spec D15） */
function confirmDelete(postId: string) {
  $q.dialog({
    title: '永久刪除這則留言？',
    message: '留言、附議與回覆都會一起刪除，無法復原。只是不想讓會友看到的話，可以改用「隱藏」。',
    cancel: { label: '取消', flat: true, noCaps: true, color: 'dark' },
    ok: { label: '刪除', flat: true, noCaps: true, color: 'negative' },
  }).onOk(() => {
    board
      .deletePost(postId)
      .then(() => {
        if (replyId.value === postId) {
          replyId.value = null;
          replyDialog.value = false;
        }
        $q.notify({ message: '已刪除留言' });
      })
      .catch((e: unknown) => $q.notify({ message: errorMessage(e) }));
  });
}

/** 刪除回覆：不必打開回覆面板（AC7.5），一樣先確認 */
function confirmDeleteReply(postId: string, replyId: string) {
  $q.dialog({
    title: '刪除這則回覆？',
    message: '刪除後會友就看不到這則回覆了，無法復原。',
    cancel: { label: '取消', flat: true, noCaps: true, color: 'dark' },
    ok: { label: '刪除', flat: true, noCaps: true, color: 'negative' },
  }).onOk(() => {
    board
      .deleteReply(postId, replyId)
      .then(() => $q.notify({ message: '已刪除回覆' }))
      .catch((e: unknown) => $q.notify({ message: errorMessage(e) }));
  });
}

/** 頁首「放大」：從目前篩選與排序的第一則開始（AC9.1） */
function zoom() {
  board.startStage();
  const first = board.visible[0]?.id;
  void router.push({
    path: `/admin/sessions/${id.value}/stage`,
    query: first ? { post: first } : {},
  });
}

function showNew() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  board.flushPending();
}
</script>

<template>
  <main v-if="board.status === 'not_found'" class="missing">
    <h1>找不到這個場次</h1>
    <p class="text-muted">可能已被刪除。</p>
    <router-link to="/admin" class="btn btn--secondary">回場次列表</router-link>
  </main>

  <div v-else class="manage">
    <div v-if="board.connection === 'disconnected'" class="conn-bar" role="status">
      連線中斷，正在重新連線…
    </div>

    <!-- 標題列 -->
    <header class="bar">
      <div class="bar__info">
        <template v-if="s">
          <h1 class="bar__title">{{ s.title }}</h1>
          <span class="bar__sub">
            {{ formatShortDate(s.sermonDate)
            }}<template v-if="s.speaker"> · {{ s.speaker }}</template> · 場次碼 {{ s.code }}
          </span>
        </template>
        <q-skeleton v-else type="text" width="240px" height="40px" />
      </div>
      <div v-if="s" class="bar__status">
        <span class="status-dot" :class="dotClass" />
        <span>{{ statusText }}</span>
        <button
          v-if="board.writable"
          type="button"
          class="btn btn--text bar__auto"
          @click="autoCloseDialog"
        >
          {{ s.autoCloseAt ? '修改' : '設定自動結束' }}
        </button>
      </div>
      <div v-if="s" class="bar__actions">
        <!-- 放大只在平板、電腦（手機螢幕太小，投影用不到；spec AC9.1） -->
        <button
          v-if="!isPhone"
          type="button"
          class="btn btn--secondary"
          :disabled="!board.visible.length"
          @click="zoom"
        >
          放大
        </button>
        <button type="button" class="btn btn--secondary" @click="shareOpen = true">分享 QR</button>
        <button
          v-if="board.writable"
          type="button"
          class="btn btn--secondary"
          :disabled="statusBusy"
          @click="endSession"
        >
          結束留言
        </button>
        <button
          v-else
          type="button"
          class="btn btn--secondary"
          :disabled="statusBusy"
          @click="setStatus('open')"
        >
          {{ s.status === 'draft' ? '開放留言' : '重新開放' }}
        </button>
        <button type="button" class="btn btn--secondary bar__more" aria-label="更多操作">
          ⋯
          <q-menu anchor="bottom right" self="top right">
            <q-list style="min-width: 200px">
              <q-item v-close-popup clickable :to="`/admin/sessions/${s.id}/edit`">
                <q-item-section>編輯場次資訊</q-item-section>
              </q-item>
              <q-item v-close-popup clickable :to="`/s/${s.code}`">
                <q-item-section>前往會友留言板</q-item-section>
              </q-item>
              <q-separator />
              <q-item v-close-popup clickable @click="removeSession">
                <q-item-section class="text-negative">刪除場次</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </button>
      </div>
    </header>

    <!-- 建立後：最上方先顯示 QR（AC5.2；ux.md A3 ③） -->
    <section v-if="s && showHero" class="hero" aria-label="分享 QR">
      <div class="hero__qr"><QrImage :text="url" /></div>
      <div class="hero__text">
        <p class="hero__lead">
          {{ s.status === 'draft' ? '已存成草稿' : '場次已建立，會友現在可以掃碼留言' }}
        </p>
        <p class="hero__code">{{ s.code }}</p>
        <p class="hero__url">{{ displayUrl(url) }}</p>
        <div class="hero__actions">
          <button type="button" class="btn btn--primary" @click="projecting = true">
            全螢幕投影 QR
          </button>
          <button type="button" class="btn btn--secondary" @click="copyLink">複製連結</button>
          <button type="button" class="btn btn--text btn--muted" @click="heroHidden = true">
            收起
          </button>
        </div>
      </div>
    </section>

    <!-- 草稿提醒（ux.md A3 ③'） -->
    <div v-if="s?.status === 'draft'" class="draft">
      <span>這是草稿：會友現在掃碼會看到「找不到此場次」。</span>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="statusBusy"
        @click="setStatus('open')"
      >
        開放留言
      </button>
    </div>

    <div class="cols">
      <section class="cols__list">
        <FilterTabs
          v-model:filter="board.filter"
          v-model:sort="board.sort"
          class="tabs-inset"
          :filters="ADMIN_FILTERS"
          :sorts="ADMIN_SORTS"
          :counts="board.counts"
        />

        <button v-if="board.orderStale" type="button" class="stale" @click="board.refreshOrder()">
          排序已變動，點此更新
        </button>

        <div v-if="board.status === 'loading'" class="list">
          <div v-for="i in 4" :key="i" class="skeleton">
            <q-skeleton type="text" width="30%" />
            <q-skeleton type="text" />
          </div>
        </div>

        <p v-else-if="!board.visible.length" class="empty">
          {{
            board.filter === 'pending'
              ? board.counts.all
                ? '所有留言都回應了。'
                : '還沒有留言。'
              : board.filter === 'hidden'
                ? '沒有隱藏的留言。'
                : board.filter === 'answered' && board.counts.all
                  ? '還沒有回應的留言。'
                  : '還沒有留言。'
          }}
        </p>

        <TransitionGroup v-else name="fade" tag="div" class="list">
          <PostCard
            v-for="p in board.visible"
            :key="p.id"
            :post="p"
            mode="admin"
            can-reply
            :selected="showPanel && replyId === p.id"
            @reply="openReply(p.id)"
            @hide="hide(p.id, $event)"
            @delete="confirmDelete(p.id)"
            @delete-reply="confirmDeleteReply(p.id, $event)"
          />
        </TransitionGroup>
      </section>

      <!-- 回覆面板（≥ 1024px） -->
      <aside v-if="showPanel" class="cols__panel" aria-label="回覆">
        <ReplyEditor v-if="replyPost" :post="replyPost" autofocus @close="replyId = null" />
        <div v-else class="panel-empty">
          <p class="panel-empty__title">回覆</p>
          <p class="text-muted">
            點留言右側的「回覆」開始回覆。回覆會顯示在該則留言下方，會友即時看得到。
          </p>
        </div>
      </aside>
    </div>

    <button v-if="board.newCount > 0" type="button" class="pill" @click="showNew">
      ↑ {{ board.newCount }} 則新留言
    </button>
    <div class="sr-only" aria-live="polite">
      {{ board.newCount > 0 ? `有 ${board.newCount} 則新留言` : '' }}
    </div>

    <!-- 手機、平板：回覆面板（與會友撰寫留言相同） -->
    <ReplySheet
      v-if="!showPanel && replyPost"
      v-model="replyDialog"
      :post="replyPost"
      @hide="replyId = null"
    />

    <QrShareDialog
      v-if="s"
      v-model="shareOpen"
      :session="s"
      :opening="statusBusy"
      @open-session="setStatus('open')"
    />
    <QrProjector
      v-if="s && projecting"
      :url="url"
      :code="s.code"
      :title="s.title"
      @close="projecting = false"
    />

    <router-view />
  </div>
</template>

<style scoped lang="scss">
.missing {
  padding: 48px 24px;

  h1 {
    margin: 0 0 8px;
    font-size: 22px;
    font-weight: 600;
  }
}

.conn-bar {
  position: sticky;
  top: var(--admin-top, 3px);
  z-index: 15;
  padding: 10px 20px;
  font-size: 14px;
  text-align: center;
  color: var(--echo-muted);
  background: var(--echo-subtle);
  border-bottom: 1px solid var(--echo-line);
}

.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  min-height: 64px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--echo-line);
  background: var(--echo-bg);

  // 電腦上場次標題列固定在頂端；手機上太高（標題＋狀態＋按鈕），跟會友端一樣捲走
  @media (min-width: 1024px) {
    position: sticky;
    top: var(--admin-top, 3px);
    z-index: 16;
    flex-wrap: nowrap; // 固定一行（回覆面板的位置以 65px 計算）
    height: 65px;
    padding-top: 0;
    padding-bottom: 0;

    .bar__title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 100%;
  }

  &__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.4;
  }

  &__sub {
    font-size: 13px;
    color: var(--echo-muted);
  }

  &__status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    flex: 1 1 100%;
  }

  &__auto {
    min-height: 36px;
    padding: 0 8px;
    font-size: 14px;
    color: var(--echo-primary);
  }

  &__actions {
    display: flex;
    gap: 8px;
    flex: 1 1 100%;

    .btn {
      min-height: 40px;
      padding: 0 14px;
      font-size: 14px;
    }

    .btn:not(.bar__more) {
      flex: 1;
    }
  }

  &__more {
    width: 44px;
    padding: 0 !important;
    font-size: 16px;
  }
}

@media (min-width: 600px) {
  .bar {
    &__info {
      flex: 0 1 auto;
    }

    &__status {
      flex: 0 0 auto;
    }

    &__actions {
      flex: 0 0 auto;
      margin-left: auto;

      .btn:not(.bar__more) {
        flex: 0 0 auto;
      }
    }
  }
}

.hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px 32px;
  padding: 24px 20px;
  border-bottom: 1px solid var(--echo-line);

  &__qr {
    width: 168px;
    flex-shrink: 0;
  }

  &__text p {
    margin: 0;
  }

  &__lead {
    font-size: 15px;
    color: var(--echo-muted);
  }

  &__code {
    margin-top: 4px !important;
    font-size: 32px;
    font-weight: 600;
    letter-spacing: 0.12em;
    font-variant-numeric: tabular-nums;
  }

  &__url {
    font-size: 14px;
    color: var(--echo-muted);
    overflow-wrap: anywhere;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
}

.draft {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--echo-line);
  background: var(--echo-subtle);
  font-size: 15px;

  span {
    flex: 1 1 240px;
  }
}

.cols {
  display: flex;
  align-items: flex-start;

  &__list {
    flex: 1;
    min-width: 0;
  }

  &__panel {
    position: sticky;
    top: calc(var(--admin-top, 3px) + 65px); // 在固定的場次標題列下方
    width: 340px;
    flex-shrink: 0;
    height: calc(100vh - var(--admin-top, 3px) - 65px);
    padding: 24px;
    border-left: 1px solid var(--echo-line);
    overflow-y: auto;
  }
}

@media (min-width: 1280px) {
  .cols__panel {
    width: 380px;
  }
}

.tabs-inset {
  padding: 0 20px;
}

.list :deep(.post) {
  padding-left: 20px;
  padding-right: 20px;
}

.stale {
  display: block;
  width: 100%;
  min-height: 44px;
  border: 0;
  border-bottom: 1px solid var(--echo-line);
  background: var(--echo-subtle);
  color: var(--echo-primary);
  font-size: 14px;
  cursor: pointer;
}

.skeleton {
  padding: 16px 20px;
  border-bottom: 1px solid var(--echo-line);
}

.empty {
  padding: 48px 20px;
  color: var(--echo-muted);
}

.panel-empty {
  &__title {
    margin: 0 0 8px;
    font-weight: 600;
  }

  p {
    font-size: 15px;
  }
}

.pill {
  position: fixed;
  top: 72px;
  left: 50%;
  z-index: 26;
  transform: translateX(-50%);
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--echo-border);
  border-radius: 999px;
  background: var(--echo-bg);
  color: var(--echo-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.fade-enter-active {
  transition: opacity 0.4s ease;
}

.fade-enter-from {
  opacity: 0;
}
</style>
