<script setup lang="ts">
// 撰寫留言（ux.md M3）：手機、平板用撰寫面板（ComposeSheet，與管理者回覆共用），
// 電腦直接展開在列表上方。
import { computed, nextTick, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useBoardStore } from '@/stores/board';
import { LIMITS } from '@/types/models';
import { errorMessage } from '@/utils/errors';
import ComposeSheet from './ComposeSheet.vue';

const props = defineProps<{
  variant: 'inline' | 'dialog';
  /** dialog 是否開啟 */
  modelValue?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [open: boolean] }>();

const $q = useQuasar();
const board = useBoardStore();

const NICK_KEY = 'echo.nickname';
const draftKey = computed(() => `echo.draft.${board.session?.id ?? ''}`);

function readStorage(store: Storage, key: string): string {
  try {
    return store.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function writeStorage(store: Storage, key: string, value: string) {
  try {
    if (value) store.setItem(key, value);
    else store.removeItem(key);
  } catch {
    // 無痕模式等情況
  }
}

const body = ref(readStorage(sessionStorage, draftKey.value));
const nickname = ref(readStorage(localStorage, NICK_KEY)); // 暱稱記憶於該裝置（AC2.2）
const sending = ref(false);
const error = ref('');

// 草稿暫存，不小心關掉也不會遺失
watch(body, (v) => writeStorage(sessionStorage, draftKey.value, v));

const trimmed = computed(() => body.value.trim());
const tooLong = computed(() => body.value.length > LIMITS.postBody);
const canSend = computed(
  () => !!trimmed.value && !tooLong.value && !sending.value && board.writable,
);

const open = computed({
  get: () => !!props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

watch(open, (v) => {
  if (v) error.value = '';
});

async function submit() {
  if (!canSend.value) return;
  sending.value = true;
  error.value = '';
  try {
    const nick = nickname.value.trim();
    writeStorage(localStorage, NICK_KEY, nick);
    await board.createPost({ body: trimmed.value, nickname: nick || null });
    body.value = '';
    open.value = false;
    $q.notify({ message: '已送出，謝謝你的回應' });
    // 捲到自己的留言：「最舊」排序在最下方，其他排序在最上方
    await nextTick();
    window.scrollTo({
      top: board.sort === 'oldest' ? document.documentElement.scrollHeight : 0,
      behavior: 'smooth',
    });
  } catch (e) {
    error.value = errorMessage(e); // 失敗時保留內容（ux.md M3）
  } finally {
    sending.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
}
</script>

<template>
  <!-- 電腦：直接展開在列表上方 -->
  <form v-if="variant === 'inline'" class="composer composer--inline" @submit.prevent="submit">
    <label for="composer-body" class="sr-only">留言內容</label>
    <div class="composer__box">
      <textarea
        id="composer-body"
        v-model="body"
        class="composer__text"
        rows="3"
        placeholder="寫下你的問題、感動或回應…"
        :maxlength="LIMITS.postBody + 50"
        @keydown="onKeydown"
      />
      <div class="composer__bar">
        <label class="composer__nick">
          <span class="sr-only">暱稱（選填）</span>
          <input
            v-model="nickname"
            class="composer__nick-input"
            placeholder="暱稱（選填，不填顯示匿名）"
            :maxlength="LIMITS.nickname"
          />
        </label>
        <span class="composer__count" :class="{ 'composer__count--over': tooLong }"
          >{{ body.length }}/{{ LIMITS.postBody }}</span
        >
        <button type="submit" class="btn btn--primary" :disabled="!canSend">
          <q-spinner v-if="sending" size="16px" />
          送出
        </button>
      </div>
    </div>
    <p v-if="error" class="field__error composer__error" role="alert">{{ error }}</p>
  </form>

  <!-- 手機、平板：撰寫面板（與管理者回覆相同） -->
  <ComposeSheet
    v-else
    v-model="open"
    v-model:body="body"
    title="撰寫留言"
    text-label="留言內容"
    placeholder="寫下你的問題、感動或回應…"
    :maxlength="LIMITS.postBody + 50"
    :can-send="canSend"
    :sending="sending"
    :error="error"
    @submit="submit"
  >
    <template #footer>
      <label class="composer__nick">
        <span class="sr-only">暱稱（選填）</span>
        <input
          v-model="nickname"
          class="composer__nick-input"
          placeholder="暱稱（選填，不填顯示匿名）"
          :maxlength="LIMITS.nickname"
          autocomplete="nickname"
          enterkeyhint="done"
        />
      </label>
      <span class="composer__count" :class="{ 'composer__count--over': tooLong }">
        {{ body.length }}/{{ LIMITS.postBody }}
      </span>
    </template>
  </ComposeSheet>
</template>

<style scoped lang="scss">
.composer {
  &--inline {
    padding: 16px 0 8px;
  }

  &__box {
    border: 1px solid var(--echo-border);
    border-radius: var(--echo-radius);
    background: var(--echo-bg);

    &:focus-within {
      border-color: var(--echo-primary);
    }
  }

  &__text {
    display: block;
    width: 100%;
    min-height: 88px;
    padding: 14px 16px 6px;
    border: 0;
    border-radius: var(--echo-radius);
    background: transparent;
    font: inherit;
    font-size: 17px;
    line-height: 1.6;
    resize: vertical;

    &:focus {
      outline: none;
    }
  }

  &__bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 8px 8px 16px;
    border-top: 1px solid var(--echo-line);
  }

  &__nick {
    flex: 1;
    min-width: 0;
  }

  &__nick-input {
    width: 100%;
    min-height: 44px;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 16px; // 小於 16px 時 iOS 會自動放大頁面

    &:focus {
      outline: none;
    }
  }

  &__count {
    font-size: 13px;
    color: var(--echo-muted);
    font-variant-numeric: tabular-nums;

    &--over {
      color: var(--echo-danger);
    }
  }

  &__error {
    margin: 8px 0 0;
  }
}
</style>
