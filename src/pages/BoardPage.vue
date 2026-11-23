<script setup lang="ts">
// M2 場次留言板（ux.md M2、M4；US1–US4、AC9.6）。開放中與過去場次共用。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import { useBoardStore } from '@/stores/board';
import { useAuthStore } from '@/stores/auth';
import { useBreakpoint } from '@/composables/useBreakpoint';
import PostCard from '@/components/PostCard.vue';
import PostComposer from '@/components/PostComposer.vue';
import CommentSheet from '@/components/CommentSheet.vue';
import CommentInline from '@/components/CommentInline.vue';
import MemberHeader from '@/components/MemberHeader.vue';
import QrProjector from '@/components/QrProjector.vue';
import { buildSessionUrl } from '@/utils/sessionUrl';
import { siteUrl } from '@/utils/config';
import FilterTabs from '@/components/FilterTabs.vue';
import { MEMBER_FILTERS, MEMBER_SORTS } from '@/utils/sortFilter';
import { errorMessage } from '@/utils/errors';
import { formatAutoClose, formatLongDate } from '@/utils/time';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const board = useBoardStore();
const auth = useAuthStore();
const { isDesktop, isPhone } = useBreakpoint();

const code = computed(() => String(route.params.code ?? '').toUpperCase());
const composerOpen = ref(false);
/** 接續留言的對象（spec US10） */
const commentPostId = ref<string | null>(null);
const commentOpen = ref(false);
const commentPost = computed(() =>
  commentPostId.value ? board.get(commentPostId.value) : undefined,
);
/** 全螢幕 QR：會友端也能開，方便負責投影的人員使用（AC5.12） */
const qrOpen = ref(false);
const scrolled = ref(false);
const titleEl = ref<HTMLElement | null>(null);

const s = computed(() => board.session);
const closed = computed(() => board.status === 'ready' && !board.writable);
const subtitle = computed(() => {
  if (!s.value) return '';
  const parts = [formatLongDate(s.value.sermonDate)];
  if (s.value.status === 'open' && board.writable && s.value.autoCloseAt) {
    parts.push(`留言開放至 ${formatAutoClose(s.value.autoCloseAt)}`);
  }
  if (closed.value) parts.push('已結束');
  return parts.join(' · ');
});
const speakerLine = computed(() =>
  [s.value?.speaker, s.value?.scripture].filter(Boolean).join(' · '),
);

function onScroll() {
  const y = window.scrollY;
  // 場次標題被頁首蓋住後，頁首改顯示標題
  const bottom = titleEl.value?.getBoundingClientRect().bottom;
  scrolled.value = bottom !== undefined ? bottom < 56 : y > 140;
  board.atTop = y < 120;
}

async function load() {
  // 建立匿名身分失敗時仍可唯讀瀏覽（留言、附議時會再試一次）
  await auth.ensure().catch(() => null);
  await board.open({ code: code.value }, 'member');
}

watch(code, load);
onMounted(() => {
  void load();
  window.addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));

function showNew() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  board.flushPending();
}

async function upvote(id: string) {
  try {
    await board.toggleUpvote(id);
  } catch (e) {
    $q.notify({ message: errorMessage(e) });
  }
}

const emptyText = computed(() => {
  if (board.counts.all && board.filter === 'pending') return '所有留言都回應了。';
  if (board.counts.all && board.filter === 'answered') return '還沒有回應的留言。';
  return closed.value ? '這個場次沒有留言。' : '還沒有人留言，成為第一個吧！';
});

/** 頁首「放大」：從目前篩選與排序的第一則開始（AC9.6） */
function zoom(postId?: string) {
  board.startStage();
  const first = postId ?? board.visible[0]?.id;
  void router.push({ path: `/s/${code.value}/stage`, query: first ? { post: first } : {} });
}

function openComposer() {
  composerOpen.value = true;
}

/** 手機、平板開面板；電腦直接在卡片下方展開，再按一次收起（ux.md M5） */
function openComment(postId: string) {
  if (isDesktop.value) {
    commentPostId.value = commentPostId.value === postId ? null : postId;
    return;
  }
  commentPostId.value = postId;
  commentOpen.value = true;
}
</script>

<template>
  <MemberHeader back="/" :title="s?.title ?? ''" :condensed="scrolled && !!s">
    <!-- QR code、放大只在平板、電腦：手機是會友自己看的，不會拿來投影（spec AC5.12、AC9.6） -->
    <template v-if="s && !isPhone" #actions>
      <button type="button" class="btn btn--text head__action" @click="qrOpen = true">
        QR code
      </button>
      <button type="button" class="btn btn--text head__action" @click="zoom()">放大</button>
    </template>
  </MemberHeader>

  <!-- 找不到 / 草稿（AC1.3） -->
  <main v-if="board.status === 'not_found'" class="page state">
    <h1 class="state__title">找不到此場次</h1>
    <p class="text-muted">場次碼可能打錯了，或場次還沒開放。</p>
    <router-link to="/" class="btn btn--primary btn--lg state__btn">回首頁輸入場次碼</router-link>
  </main>

  <main v-else-if="board.status === 'error'" class="page state">
    <h1 class="state__title">無法載入</h1>
    <p class="text-muted">請確認網路連線後再試一次。</p>
    <button type="button" class="btn btn--primary btn--lg state__btn" @click="load">重試</button>
  </main>

  <div v-else class="board" :class="{ 'board--has-bar': !isDesktop }">
    <!-- 管理者提示列（AC5.7） -->
    <div v-if="auth.isStaff && s" class="staff-bar">
      你目前以管理者身分登入 ·
      <router-link :to="`/admin/sessions/${s.id}`">前往管理此場次 →</router-link>
    </div>

    <!-- 斷線（ux.md M4） -->
    <div v-if="board.connection === 'disconnected'" class="conn-bar" role="status">
      連線中斷，正在重新連線…
    </div>

    <main class="page">
      <header class="head">
        <template v-if="s">
          <p class="head__sub">{{ subtitle }}</p>
          <h1 ref="titleEl" class="head__title">{{ s.title }}</h1>
          <p v-if="speakerLine" class="head__speaker">{{ speakerLine }}</p>
        </template>
        <template v-else>
          <q-skeleton type="text" width="40%" />
          <q-skeleton type="text" height="34px" width="70%" />
          <q-skeleton type="text" width="50%" />
        </template>
      </header>

      <PostComposer v-if="isDesktop && board.writable" variant="inline" />

      <FilterTabs
        v-model:filter="board.filter"
        v-model:sort="board.sort"
        :filters="MEMBER_FILTERS"
        :sorts="MEMBER_SORTS"
        :counts="board.counts"
      />

      <button v-if="board.orderStale" type="button" class="stale" @click="board.refreshOrder()">
        排序已變動，點此更新
      </button>

      <!-- 初次載入骨架 -->
      <div v-if="board.status === 'loading'" aria-busy="true">
        <div v-for="i in 3" :key="i" class="skeleton">
          <q-skeleton type="text" width="30%" />
          <q-skeleton type="text" />
          <q-skeleton type="text" width="80%" />
        </div>
      </div>

      <p v-else-if="!board.visible.length" class="empty">
        {{ emptyText }}
      </p>

      <TransitionGroup v-else name="fade" tag="div" class="list">
        <PostCard
          v-for="p in board.visible"
          :key="p.id"
          :post="p"
          mode="member"
          :writable="board.writable"
          @upvote="upvote(p.id)"
          @comment="openComment(p.id)"
        >
          <template v-if="isDesktop && commentPostId === p.id && board.writable" #after>
            <CommentInline :post="p" @close="commentPostId = null" />
          </template>
        </PostCard>
      </TransitionGroup>
    </main>

    <!-- 新留言提示（ux.md §6.1） -->
    <button v-if="board.newCount > 0" type="button" class="pill" @click="showNew">
      ↑ {{ board.newCount }} 則新留言
    </button>
    <div class="sr-only" aria-live="polite">
      {{ board.newCount > 0 ? `有 ${board.newCount} 則新留言` : '' }}
    </div>

    <!-- 底部輸入列 / 已結束 -->
    <div v-if="!isDesktop && board.status === 'ready'" class="bottom">
      <div class="page">
        <button v-if="board.writable" type="button" class="bottom__input" @click="openComposer">
          寫下你的問題或回應…
        </button>
        <p v-else class="bottom__closed">本場次已結束，感謝你的回應</p>
      </div>
    </div>
    <p v-else-if="closed" class="page desk-closed">本場次已結束，感謝你的回應</p>

    <PostComposer v-if="!isDesktop" v-model="composerOpen" variant="dialog" />

    <CommentSheet v-if="commentPost && !isDesktop" v-model="commentOpen" :post="commentPost" />

    <QrProjector
      v-if="s && qrOpen"
      :url="buildSessionUrl(siteUrl(), s.code)"
      :code="s.code"
      :title="s.title"
      @close="qrOpen = false"
    />
  </div>
</template>

<style scoped lang="scss">
.board {
  padding-bottom: 32px;

  &--has-bar {
    padding-bottom: calc(96px + env(safe-area-inset-bottom));
  }
}

.state {
  padding-top: 64px;

  &__title {
    margin: 0 0 8px;
    font-size: 22px;
    font-weight: 600;
  }

  &__btn {
    margin-top: 24px;
  }
}

.staff-bar,
.conn-bar {
  padding: 10px 20px;
  font-size: 14px;
  text-align: center;
  background: var(--echo-muted-bg);
  border-bottom: 1px solid var(--echo-line);

  a {
    color: var(--echo-primary);
    font-weight: 600;
    text-decoration: none;
  }
}

.conn-bar {
  position: sticky;
  top: 56px; // MemberHeader 下方
  z-index: 30;
  color: var(--echo-muted);
}

.head {
  padding: 20px 0 16px;

  &__action {
    font-size: 15px;
  }

  &__sub {
    margin: 0;
    font-size: 14px;
    color: var(--echo-muted);
  }

  &__title {
    margin: 4px 0 2px;
    font-size: 22px;
    font-weight: 600;
    line-height: 1.4;
  }

  &__speaker {
    margin: 0;
    font-size: 15px;
    color: var(--echo-muted);
  }
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

// 卡片列表：和上方「全部／待回應」那排留空隙
.list {
  padding-top: 12px;
}

.skeleton {
  margin-bottom: 8px;
  padding: 16px;
  border: 1px solid var(--echo-line);
  border-radius: var(--echo-radius-lg);
  background: var(--echo-bg);

  &:first-child {
    margin-top: 12px;
  }
}

.empty {
  padding: 48px 0;
  text-align: center;
  color: var(--echo-muted);
}

.pill {
  position: fixed;
  top: 68px; // MemberHeader 下方
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

.bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  padding: 10px 0 calc(10px + env(safe-area-inset-bottom));
  background: var(--echo-bg);
  border-top: 1px solid var(--echo-line);

  &__input {
    width: 100%;
    min-height: 48px;
    padding: 0 16px;
    border: 1px solid var(--echo-border);
    border-radius: var(--echo-radius);
    background: var(--echo-bg);
    color: var(--echo-muted);
    font-size: 16px;
    text-align: left;
    cursor: text;
  }

  &__closed {
    margin: 0;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--echo-muted);
    font-size: 15px;
  }
}

.desk-closed {
  margin-top: 24px;
  text-align: center;
  color: var(--echo-muted);
}

.fade-enter-active {
  transition: opacity 0.4s ease;
}

.fade-enter-from {
  opacity: 0;
}
</style>
