<script setup lang="ts">
// 回覆的編輯記錄（spec AC6.6、D22；ux.md §5）：點回覆上的「已編輯」開啟，會友端與管理端相同。
// 由新到舊列出每一版的內容與時間，最上面是目前的版本。
import { computed, ref, watch } from 'vue';
import type { Reply, ReplyVersion } from '@/types/models';
import { useBoardStore } from '@/stores/board';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { errorMessage } from '@/utils/errors';
import { formatPostTime } from '@/utils/time';

const props = defineProps<{ reply: Reply }>();
const open = defineModel<boolean>({ default: false });

const board = useBoardStore();
const { isPhone } = useBreakpoint();

const versions = ref<ReplyVersion[]>([]);
const loading = ref(false);
const error = ref('');

const newestFirst = computed(() => [...versions.value].reverse());

function label(v: ReplyVersion): string {
  if (v.current) return '目前版本';
  if (v.index === 0) return '原始版本';
  return `第 ${v.index} 次編輯`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    versions.value = await board.replyHistory(props.reply);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [open.value, props.reply.id, props.reply.editedAt] as const,
  ([isOpen]) => {
    if (isOpen) void load();
  },
  { immediate: true },
);
</script>

<template>
  <q-dialog v-model="open" :maximized="isPhone" transition-show="fade" transition-hide="fade">
    <div class="history" :class="{ 'history--phone': isPhone }" role="dialog" aria-label="編輯記錄">
      <div class="history__bar">
        <span class="history__title">編輯記錄</span>
        <button type="button" class="btn btn--text btn--muted" @click="open = false">關閉</button>
      </div>

      <div class="history__list">
        <p class="history__who">{{ reply.authorName }}的回覆</p>

        <div v-if="loading && !versions.length" class="history__state">
          <q-spinner size="20px" />
        </div>
        <p v-else-if="error" class="field__error history__state" role="alert">
          {{ error }}
          <button type="button" class="btn btn--text" @click="load">重試</button>
        </p>

        <ol v-else class="history__versions">
          <li
            v-for="v in newestFirst"
            :key="v.index"
            class="history__version"
            :class="{ 'history__version--current': v.current }"
          >
            <div class="history__meta">
              <span class="history__label">{{ label(v) }}</span>
              · {{ formatPostTime(v.at) }}
            </div>
            <div class="history__body">{{ v.body }}</div>
          </li>
        </ol>
      </div>
    </div>
  </q-dialog>
</template>

<style scoped lang="scss">
.history {
  display: flex;
  flex-direction: column;
  width: 520px;
  max-width: 100%;
  max-height: 80vh;
  border-radius: var(--echo-radius);
  background: var(--echo-bg);

  &--phone {
    width: 100%;
    height: 100%;
    max-height: none;
    padding-top: env(safe-area-inset-top);
    border-radius: 0;
  }

  &__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    min-height: 56px;
    padding: 0 4px 0 16px;
    border-bottom: 1px solid var(--echo-line);
  }

  &__title {
    font-size: 17px;
    font-weight: 600;
  }

  // 整個清單是唯一的捲動區塊；捲到頂或底時不帶動後面的頁面（iOS）
  &__list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
  }

  &__who {
    margin: 0 0 12px;
    font-size: 14px;
    color: var(--echo-muted);
  }

  &__state {
    padding: 24px 0;
    text-align: center;
  }

  &__versions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__version {
    padding: 12px 14px;
    border-radius: var(--echo-radius);
    background: var(--echo-subtle);
    color: var(--echo-muted);

    &--current {
      color: var(--echo-text);
    }
  }

  &__meta {
    margin-bottom: 4px;
    font-size: 13px;
    color: var(--echo-muted);
  }

  &__label {
    font-weight: 600;
  }

  &--phone &__version--current &__label,
  &__version--current &__label {
    color: var(--echo-primary);
  }

  &__body {
    font-size: 15px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}
</style>
