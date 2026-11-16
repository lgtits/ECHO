<script setup lang="ts">
// 撰寫留言（ux.md M3）：手機、平板用彈出對話框（手機靠上），電腦直接展開在列表上方。
// 手機不用底部面板：iOS 鍵盤彈出時不縮小版面，貼底的面板會被鍵盤蓋住。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useBoardStore } from '@/stores/board';
import { LIMITS } from '@/types/models';
import { errorMessage } from '@/utils/errors';
import { useBreakpoint } from '@/composables/useBreakpoint';

const props = defineProps<{
  variant: 'inline' | 'dialog';
  /** dialog 是否開啟 */
  modelValue?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [open: boolean] }>();

const $q = useQuasar();
const board = useBoardStore();
const { isPhone } = useBreakpoint();

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

// 鍵盤彈出後的可視範圍（visualViewport）：手機上對話框不超過這個高度，也跟著 iOS 的捲動位移
const vv = ref<{ top: number; height: number } | null>(null);
function onViewport() {
  const v = window.visualViewport;
  vv.value = v ? { top: v.offsetTop, height: v.height } : null;
}
function watchViewport(on: boolean) {
  const v = window.visualViewport;
  if (!v) return;
  const fn = on ? v.addEventListener.bind(v) : v.removeEventListener.bind(v);
  fn('resize', onViewport);
  fn('scroll', onViewport);
  if (on) onViewport();
}
const shellStyle = computed(() =>
  isPhone.value && vv.value
    ? { '--vv-top': `${vv.value.top}px`, '--vv-height': `${vv.value.height}px` }
    : undefined,
);

watch(open, async (v) => {
  watchViewport(v);
  if (v) {
    error.value = '';
    await nextTick();
    textarea.value?.focus();
  }
});
onBeforeUnmount(() => watchViewport(false));

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
    class="composer-dialog"
    :class="{ 'composer-dialog--phone': isPhone }"
    transition-show="fade"
    transition-hide="fade"
  >
    <!-- Quasar 只讓 q-dialog 的直接子層 div 接收點擊，所以外面要包 div -->
    <div class="composer__shell" :style="shellStyle">
      <form
        class="composer composer--panel composer--dialog"
        aria-label="撰寫留言"
        @submit.prevent="submit"
      >
        <div class="composer__title">
          <span>撰寫留言</span>
          <button type="button" class="btn btn--text btn--muted" @click="open = false">取消</button>
        </div>
        <div class="field composer__body">
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

  &--dialog {
    width: 560px;
    max-width: calc(100vw - 32px);
    border-radius: 8px;
    padding-top: 16px;
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

<style lang="scss">
// 手機：對話框靠上，鍵盤佔下半部時輸入框與「送出」仍看得到（ux.md M3）。
// q-dialog 會 teleport 到 body，所以這段不能 scoped。
.composer-dialog--phone .q-dialog__inner {
  align-items: flex-start;
  padding: calc(16px + env(safe-area-inset-top)) 12px 16px;

  // 高度不超過鍵盤以外的可視範圍；空間不夠時縮小輸入框，「送出」永遠看得到
  > .composer__shell {
    display: flex;
    flex-direction: column;
    margin-top: var(--vv-top, 0px);
    max-height: calc(var(--vv-height, 100dvh) - 32px - env(safe-area-inset-top)) !important;
    overflow: hidden;
    border-radius: 8px;
  }

  .composer--dialog {
    flex: 0 1 auto;
    min-height: 0;
    width: 100%;
    max-width: none;
    padding-bottom: 16px;

    > .composer__body {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }
  }

  .composer__textarea {
    flex: 1 1 140px;
    min-height: 72px;
    height: auto;
    resize: none;
  }
}
</style>
