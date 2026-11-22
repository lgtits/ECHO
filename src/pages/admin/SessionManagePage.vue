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
import { formatAutoClose, formatShortDate, toYmd } from '@/utils/time';
import { useClock } from '@/composables/useClock';
import AutoClosePicker from '@/components/AutoClosePicker.vue';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const board = useBoardStore();
const sessions = useSessionsStore();
const { isDesktop, isPhone } = useBreakpoint();

const id = computed(() => String(route.params.id ?? ''));
const s = computed(() => board.session);
const clock = useClock();
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
  return x.autoCloseAt
    ? `開放中 · ${formatAutoClose(x.autoCloseAt, new Date(clock.value))} 自動結束`
    : '開放中';
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

/** 「結束留言」在「設定結束時間」對話框裡，需要確認；「開放留言」不需要（ux.md A4） */
function endSession() {
  autoOpen.value = false;
  $q.dialog({
    title: '結束留言？',
    message: '結束後會友只能瀏覽，不能再留言或附議。你之後仍可補充回覆，也可以重新開放。',
    cancel: { label: '取消', flat: true, noCaps: true, color: 'dark' },
    ok: { label: '結束留言', flat: true, noCaps: true, color: 'negative' },
  }).onOk(() => void setStatus('closed'));
}

// 快速設定自動結束（ux.md A3、A4）：日期＋時間，與場次表單共用 AutoClosePicker
const autoOpen = ref(false);
const autoDraft = ref<string | null>(null);
const autoSaving = ref(false);
/** 還沒選日期時的預設：場次日期，已經過了就用今天 */
const autoDefaultDate = computed(() => {
  const today = toYmd(new Date(clock.value));
  const d = s.value?.sermonDate ?? today;
  return d < today ? today : d;
});
const autoPast = computed(
  () => !!autoDraft.value && new Date(autoDraft.value).getTime() <= clock.value,
);

function autoCloseDialog() {
  if (!s.value) return;
  autoDraft.value = s.value.autoCloseAt;
  autoOpen.value = true;
}

async function saveAutoClose() {
  if (!s.value || autoPast.value || autoSaving.value) return;
  autoSaving.value = true;
  const iso = autoDraft.value;
  try {
    board.setSession(await sessions.setAutoClose(s.value.id, iso));
    autoOpen.value = false;
    $q.notify({
      message: iso ? `將於 ${formatAutoClose(iso, new Date())} 自動結束` : '已取消自動結束',
    });
  } catch (e) {
    $q.notify({ message: errorMessage(e) });
  } finally {
    autoSaving.value = false;
  }
}

function removeSession() {
  if (!s.value) return;
  const title = s.value.title;
  $q.dialog({
    title: '刪除場次',
    message: `刪除後，會友與管理端都看不到這個場次和它的留言、回覆。資料仍會保留，需要時可請系統管理者還原。請輸入場次標題「${title}」確認。`,
    prompt: { model: '', type: 'text', isValid: (v: string) => v.trim() === title },
    cancel: { label: '取消', flat: true, noCaps: true, color: 'dark' },
    ok: { label: '刪除', flat: true, noCaps: true, color: 'negative' },
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

/** 刪除＝封存（spec D15、D20），仍一定先確認（AC7.4） */
function confirmDelete(postId: string) {
  $q.dialog({
    title: '刪除這則留言？',
    message:
      '刪除後，會友與管理端都看不到這則留言和它的回覆；資料仍會保留，需要時可請系統管理者還原。只是不想讓會友看到的話，可以改用「隱藏」。',
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
    message: '刪除後會友就看不到這則回覆了。',
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
          <!-- 返回連結：標題上方一行小字「‹ 場次列表」（ux.md A4） -->
          <nav class="crumb" aria-label="麵包屑">
            <router-link to="/admin" class="crumb__link">
              <span class="crumb__chev" aria-hidden="true">‹</span>場次列表
            </router-link>
          </nav>
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
          class="btn btn--secondary bar__auto"
          @click="autoCloseDialog"
        >
          {{ s.autoCloseAt ? '修改結束時間' : '設定結束時間' }}
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
          v-if="!board.writable"
          type="button"
          class="btn btn--secondary"
          :disabled="statusBusy"
          @click="setStatus('open')"
        >
          {{ s.status === 'draft' ? '開放留言' : '重新開放' }}
        </button>
        <router-link :to="`/admin/sessions/${s.id}/edit`" class="btn btn--secondary">
          編輯場次資訊
        </router-link>
        <button type="button" class="btn btn--secondary bar__more" aria-label="更多操作">
          ⋯
          <q-menu anchor="bottom right" self="top right">
            <q-list style="min-width: 200px">
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
        <p class="hero__lead">場次已建立，會友現在可以掃碼留言</p>
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
    />
    <q-dialog v-if="s" v-model="autoOpen">
      <form class="auto-dialog" @submit.prevent="saveAutoClose">
        <h2 class="auto-dialog__title">設定結束時間</h2>
        <p class="auto-dialog__text text-muted">到時間後自動結束留言，可以設定在其他天。</p>
        <AutoClosePicker
          v-model="autoDraft"
          :default-date="autoDefaultDate"
          id-prefix="quick-close"
        />
        <div class="auto-dialog__actions">
          <button
            type="button"
            class="btn btn--text btn--danger auto-dialog__end"
            :disabled="statusBusy"
            @click="endSession"
          >
            立即結束留言
          </button>
          <button type="button" class="btn btn--text" @click="autoOpen = false">取消</button>
          <button type="submit" class="btn btn--primary" :disabled="autoPast || autoSaving">
            <q-spinner v-if="autoSaving" size="16px" />
            儲存
          </button>
        </div>
      </form>
    </q-dialog>
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
.manage {
  // 電腦版固定的場次標題列高度：返回連結＋標題＋日期資訊三行
  --bar-h: 80px;
}

.auto-dialog {
  width: 400px;
  max-width: calc(100vw - 32px);
  padding: 20px;
  border-radius: var(--echo-radius-lg);
  background: var(--echo-bg);

  &__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  &__text {
    margin: 4px 0 16px;
    font-size: 14px;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }

  // 立即結束放左邊，與「取消／儲存」分開，避免誤按
  &__end {
    margin-right: auto;
    margin-left: -12px;
  }
}

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
  background: var(--echo-muted-bg);
  border-bottom: 1px solid var(--echo-line);
}

.crumb {
  display: flex;

  &__link {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: -2px;
    font-size: 13px;
    line-height: 18px;
    color: var(--echo-muted);
    text-decoration: none;

    &:hover {
      color: var(--echo-primary);
    }
  }

  &__chev {
    font-size: 18px;
    line-height: 1;
    margin-top: -2px;
  }
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
    flex-wrap: nowrap; // 固定一行（回覆面板的位置以 var(--bar-h) 計算）
    height: var(--bar-h);
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
    min-width: 0;
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
    margin-left: 6px;
    padding: 0 12px;
    font-size: 14px;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap; // 手機上已結束時有四顆按鈕，放不下就換行
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

.cols {
  display: flex;
  align-items: flex-start;

  &__list {
    flex: 1;
    min-width: 0;
  }

  &__panel {
    position: sticky;
    top: calc(var(--admin-top, 3px) + var(--bar-h)); // 在固定的場次標題列下方
    width: 340px;
    flex-shrink: 0;
    height: calc(100vh - var(--admin-top, 3px) - var(--bar-h));
    padding: 24px;
    border-left: 1px solid var(--echo-line);
    background: var(--echo-bg);
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

// 卡片列表：和上方「全部／待回應」那排、左右邊緣都留空隙
.list {
  padding: 12px 20px 24px; // 卡片左緣對齊 tabs 文字
}

.stale {
  display: block;
  width: 100%;
  min-height: 44px;
  border: 0;
  border-bottom: 1px solid var(--echo-line);
  background: var(--echo-muted-bg);
  color: var(--echo-primary);
  font-size: 14px;
  cursor: pointer;
}

.skeleton {
  margin-bottom: 8px;
  padding: 16px;
  border: 1px solid var(--echo-line);
  border-radius: var(--echo-radius-lg);
  background: var(--echo-bg);
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
  border: 0;
  border-radius: 999px;
  background: var(--echo-primary);
  color: #fff;
  box-shadow: var(--echo-float-shadow);
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
