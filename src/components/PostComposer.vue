<script setup lang="ts">
// 撰寫留言（ux.md M3）：手機底部面板、平板置中對話框、電腦直接展開在列表上方。
import { computed, nextTick, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useBoardStore } from '@/stores/board';
import { LIMITS } from '@/types/models';
import { errorMessage } from '@/utils/errors';

const props = defineProps<{
  variant: 'inline' | 'sheet' | 'dialog';
  /** sheet / dialog 是否開啟 */
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
const textarea = ref<HTMLTextAreaElement | null>(null);

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

watch(open, async (v) => {
  if (v) {
    error.value = '';
    await nextTick();
    textarea.value?.focus();
  }
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
  <form v-if="variant === 'inline'" class="composer composer--inline" @submit.prevent="submit">
    <label for="composer-body" class="sr-only">留言內容</label>
    <div class="composer__box">
      <textarea
        id="composer-body"
        ref="textarea"
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

  <q-dialog
    v-else
    v-model="open"
    :position="variant === 'sheet' ? 'bottom' : 'standard'"
    :transition-show="variant === 'sheet' ? 'slide-up' : 'fade'"
    :transition-hide="variant === 'sheet' ? 'slide-down' : 'fade'"
  >
    <!-- Quasar 只讓 q-dialog 的直接子層 div 接收點擊，所以外面要包 div -->
    <div class="composer__shell">
      <form
        class="composer composer--panel"
        :class="`composer--${variant}`"
        aria-label="撰寫留言"
        @submit.prevent="submit"
      >
        <div v-if="variant === 'sheet'" class="composer__handle" aria-hidden="true" />
        <div v-else class="composer__title">
          <span>撰寫留言</span>
          <button type="button" class="btn btn--text btn--muted" @click="open = false">取消</button>
        </div>
        <div class="field">
          <label for="composer-body-panel" class="sr-only">留言內容</label>
          <textarea
            id="composer-body-panel"
            ref="textarea"
            v-model="body"
            class="input composer__textarea"
            :class="{ 'input--invalid': tooLong }"
            rows="5"
            placeholder="寫下你的問題、感動或回應…"
            :maxlength="LIMITS.postBody + 50"
            @keydown="onKeydown"
          />
          <span
            class="composer__count composer__count--right"
            :class="{ 'composer__count--over': tooLong }"
          >
            {{ body.length }}/{{ LIMITS.postBody }}
          </span>
        </div>
        <div class="field">
          <label for="composer-nick" class="field__label">暱稱（選填）</label>
          <input
            id="composer-nick"
            v-model="nickname"
            class="input"
            :maxlength="LIMITS.nickname"
            autocomplete="nickname"
          />
          <span class="field__hint">不填會顯示為「匿名」</span>
        </div>
        <p v-if="error" class="field__error" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn--primary btn--block btn--lg" :disabled="!canSend">
          <q-spinner v-if="sending" size="18px" />
          送出
        </button>
      </form>
    </div>
  </q-dialog>
</template>

<style scoped lang="scss">
.composer__shell {
  width: 100%;
}

.composer {
  &--inline {
    padding: 16px 0 8px;
  }

  &__box {
    border: 1px solid var(--echo-border);
    border-radius: 8px;
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
    border-radius: 8px;
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
  }

  &__nick-input {
    width: 100%;
    min-height: 40px;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 15px;

    &:focus {
      outline: none;
    }
  }

  &__count {
    font-size: 13px;
    color: var(--echo-muted);
    font-variant-numeric: tabular-nums;

    &--right {
      align-self: flex-end;
    }

    &--over {
      color: var(--echo-danger);
    }
  }

  &__error {
    margin: 8px 0 0;
  }

  &--panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    background: var(--echo-bg);
    padding: 12px 20px calc(20px + env(safe-area-inset-bottom));
  }

  &--sheet {
    border-radius: 12px 12px 0 0;
  }

  &--dialog {
    width: 560px;
    max-width: calc(100vw - 32px);
    border-radius: 8px;
    padding-top: 16px;
  }

  &__handle {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--echo-border);
    margin: 0 auto 4px;
  }

  &__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 17px;
    font-weight: 600;
  }

  &__textarea {
    min-height: 140px;
  }
}
</style>
