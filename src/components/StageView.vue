<script setup lang="ts">
// 講台模式（ux.md A7；AC9.1–9.7）：同一台裝置全螢幕顯示小卡。
// 會友端（唯讀）與管理端（可文字回覆）共用，差別只在 canReply。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { Post } from '@/types/models';
import StageCard from './StageCard.vue';

const props = defineProps<{
  posts: Post[];
  currentId: string | null;
  sessionTitle: string;
  sessionDate: string;
  /** 例：講台模式 · 待回應 · 依附議排序 */
  label: string;
  canReply?: boolean;
}>();

const emit = defineEmits<{
  'update:currentId': [id: string];
  close: [];
  reply: [post: Post];
}>();

const $q = useQuasar();
const lastIndex = ref(0);

const index = computed(() => {
  const i = props.posts.findIndex((p) => p.id === props.currentId);
  return i === -1 ? Math.min(lastIndex.value, Math.max(props.posts.length - 1, 0)) : i;
});
const post = computed(() => props.posts[index.value] ?? null);

// 目前這則被隱藏或刪除 → 自動切到下一則並提示（AC9.5）
watch(
  () => props.posts.map((p) => p.id).join(','),
  () => {
    const found = props.posts.some((p) => p.id === props.currentId);
    if (!found && props.currentId && post.value) {
      $q.notify({ message: '此留言已被隱藏或刪除，已切到下一則' });
      emit('update:currentId', post.value.id);
    }
  },
);

watch(index, (i) => (lastIndex.value = i), { immediate: true });

function go(delta: number) {
  const n = props.posts.length;
  if (!n) return;
  const next = props.posts[(index.value + delta + n) % n];
  if (next) emit('update:currentId', next.id);
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (document.querySelector('.q-dialog')) return; // 回覆對話框開著時不切換
  if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
  // 全螢幕時第一次 Esc 由瀏覽器拿去離開全螢幕，再按一次才關閉講台模式
  else if (e.key === 'Escape' && !document.fullscreenElement) emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  // iPhone Safari 不支援，就以整頁顯示（ux.md A7）
  document.documentElement.requestFullscreen?.().catch(() => undefined);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
});

const isPhonePortrait = computed(() => $q.screen.width < 600 && $q.screen.width < $q.screen.height);
</script>

<template>
  <div class="stage">
    <div class="stage__top">
      <span class="stage__label">{{ label }}</span>
      <button type="button" class="btn btn--text stage__close" @click="emit('close')">
        關閉<span class="stage__esc">（Esc）</span>
      </button>
    </div>

    <div class="stage__center">
      <div class="stage__card">
        <StageCard
          :post="post"
          :index="index"
          :session-title="sessionTitle"
          :session-date="sessionDate"
        />
      </div>
      <p v-if="isPhonePortrait" class="stage__tip">橫放手機可以看得更大</p>
    </div>

    <div class="stage__nav">
      <button
        type="button"
        class="btn btn--text stage__btn"
        :disabled="posts.length < 2"
        @click="go(-1)"
      >
        ← 上一則
      </button>
      <span class="stage__pos">{{ posts.length ? index + 1 : 0 }} / {{ posts.length }}</span>
      <button
        type="button"
        class="btn btn--text stage__btn"
        :disabled="posts.length < 2"
        @click="go(1)"
      >
        下一則 →
      </button>
      <template v-if="canReply && post">
        <span class="stage__divider" aria-hidden="true" />
        <button type="button" class="btn btn--secondary stage__btn" @click="emit('reply', post)">
          文字回覆
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stage {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  background: var(--echo-stage);
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  overflow-y: auto;

  &__top {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    color: var(--echo-muted);
  }

  &__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__close {
    margin-left: auto;
    font-size: 15px;
  }

  &__esc {
    display: none;
  }

  &__center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px 0;
  }

  &__card {
    width: 100%;
  }

  &__tip {
    margin: 0;
    font-size: 14px;
    color: var(--echo-muted);
  }

  &__nav {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 4px 8px;
  }

  &__btn {
    min-height: 56px; // 講台模式觸控區 ≥ 56px
    font-size: 17px;
  }

  &__pos {
    min-width: 64px;
    text-align: center;
    font-size: 15px;
    color: var(--echo-muted);
    font-variant-numeric: tabular-nums;
  }

  &__divider {
    width: 1px;
    height: 24px;
    margin: 0 8px;
    background: var(--echo-border);
  }
}

@media (min-width: 600px) {
  .stage {
    padding: 24px 40px 28px;

    &__card {
      // 16:10，高度也不能超出畫面
      width: min(960px, 100%, (100vh - 200px) * 1.6);
    }

    &__esc {
      display: inline;
    }
  }
}

@media (max-width: 599px) and (orientation: landscape) {
  .stage__card {
    width: min(100%, (100vh - 120px) * 1.6);
  }

  .stage__center {
    padding: 4px 0;
  }

  .stage__btn {
    min-height: 44px;
  }
}
</style>
