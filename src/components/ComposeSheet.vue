<script setup lang="ts">
// 撰寫面板（ux.md M3、A5）：會友撰寫留言與管理者回覆共用同一個外觀與行為。
// 手機：全螢幕；平板以上：置中卡片。兩者的位置與高度都跟著 visualViewport，
// 因為 iOS 鍵盤彈出時不會縮小版面，固定高度的面板會被鍵盤蓋住。
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useBreakpoint } from '@/composables/useBreakpoint';

const props = defineProps<{
  title: string;
  canSend: boolean;
  /** 輸入框的無障礙名稱 */
  textLabel: string;
  sending?: boolean;
  error?: string;
  sendLabel?: string;
  placeholder?: string;
  maxlength?: number;
}>();
const open = defineModel<boolean>({ default: false });
const body = defineModel<string>('body', { required: true });
const emit = defineEmits<{ submit: []; hide: [] }>();

const { isPhone } = useBreakpoint();
const textarea = ref<HTMLTextAreaElement | null>(null);

// 鍵盤以外的可視範圍。q-dialog 會 teleport 到 body，所以寫在 <html> 的 CSS 變數上（下方非 scoped 樣式）。
const keyboardOpen = ref(false);
function onViewport() {
  const v = window.visualViewport;
  if (!v) return;
  const root = document.documentElement.style;
  root.setProperty('--echo-vv-top', `${v.offsetTop}px`);
  root.setProperty('--echo-vv-height', `${v.height}px`);
  keyboardOpen.value = window.innerHeight - v.height > 120;
}
function watchViewport(on: boolean) {
  const v = window.visualViewport;
  if (!v) return;
  const fn = on ? v.addEventListener.bind(v) : v.removeEventListener.bind(v);
  fn('resize', onViewport);
  fn('scroll', onViewport);
  if (on) onViewport();
  else {
    document.documentElement.style.removeProperty('--echo-vv-top');
    document.documentElement.style.removeProperty('--echo-vv-height');
    keyboardOpen.value = false;
  }
}

function focus() {
  textarea.value?.focus();
}

watch(
  open,
  async (v) => {
    watchViewport(v);
    if (v) {
      await nextTick();
      focus();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => watchViewport(false));

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (props.canSend && !props.sending) emit('submit');
  }
}

defineExpose({ focus });
</script>

<template>
  <q-dialog
    v-model="open"
    class="compose-dialog"
    :class="isPhone ? 'compose-dialog--phone' : 'compose-dialog--card'"
    :maximized="isPhone"
    transition-show="fade"
    transition-hide="fade"
    @show="focus"
    @hide="emit('hide')"
  >
    <!-- Quasar 只讓 q-dialog 的直接子層 div 接收點擊，所以外面要包 div -->
    <div class="compose" :class="{ 'compose--kb': keyboardOpen }">
      <form class="compose__form" :aria-label="title" @submit.prevent="emit('submit')">
        <div class="compose__bar">
          <button type="button" class="btn btn--text btn--muted compose__cancel" @click="open = false">
            取消
          </button>
          <span class="compose__title">{{ title }}</span>
          <button
            type="submit"
            class="btn btn--primary compose__send"
            :disabled="!canSend || sending"
          >
            <q-spinner v-if="sending" size="16px" />
            {{ sendLabel ?? '送出' }}
          </button>
        </div>

        <!-- 回覆時的原留言與已有回覆；空間不夠時在這裡捲動 -->
        <div v-if="$slots.context" class="compose__context">
          <slot name="context" />
        </div>

        <p v-if="error" class="field__error compose__error" role="alert">{{ error }}</p>

        <textarea
          ref="textarea"
          v-model="body"
          class="compose__text"
          :aria-label="textLabel"
          :placeholder="placeholder"
          :maxlength="maxlength"
          @keydown="onKeydown"
        />

        <div class="compose__foot">
          <slot name="footer" />
        </div>
      </form>
    </div>
  </q-dialog>
</template>

<style scoped lang="scss">
.compose {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--echo-bg);

  &__form {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  &__bar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    flex: none;
    min-height: 56px;
    padding: 0 12px 0 4px;
    border-bottom: 1px solid var(--echo-line);
  }

  &__cancel {
    justify-self: start;
  }

  &__title {
    font-size: 17px;
    font-weight: 600;
  }

  &__send {
    justify-self: end;
    min-width: 72px;
  }

  &__context {
    flex: 0 1 auto;
    max-height: 40%;
    overflow-y: auto;
    padding: 12px 16px;
    border-bottom: 1px solid var(--echo-line);
    background: var(--echo-subtle);
  }

  &__error {
    flex: none;
    margin: 0;
    padding: 8px 16px 0;
  }

  // 佔滿剩下的空間；空間再小也只縮輸入框，頂列與底列不動
  &__text {
    flex: 1 1 auto;
    min-height: 72px;
    width: 100%;
    padding: 16px;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 17px;
    line-height: 1.6;
    resize: none;

    &:focus {
      outline: none;
    }
  }

  &__foot {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: none;
    min-height: 52px;
    padding: 4px 16px calc(4px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--echo-line);
  }

  // 鍵盤彈出時底部緊貼鍵盤，不需要 home bar 的安全區域
  &--kb &__foot {
    padding-bottom: 4px;
  }
}
</style>

<style lang="scss">
// q-dialog 會 teleport 到 body，所以這段不能 scoped。
// 面板的位置與高度 = 鍵盤以外的可視範圍（--echo-vv-*，由 visualViewport 寫入）。
.compose-dialog .q-dialog__inner {
  top: var(--echo-vv-top, 0px) !important;
  bottom: auto !important;
  height: var(--echo-vv-height, 100dvh) !important;
}

// 手機：全螢幕
.compose-dialog--phone .q-dialog__inner {
  padding: 0 !important;

  > .compose {
    width: 100%;
    height: 100% !important;
    max-height: none !important;
    padding-top: env(safe-area-inset-top);
    border-radius: 0;
  }
}

// 平板以上：置中卡片，版面與手機相同
.compose-dialog--card .q-dialog__inner {
  padding: 24px 16px !important;

  > .compose {
    width: 560px;
    max-width: 100% !important;
    height: min(560px, 100%);
    max-height: 100% !important;
    border-radius: 8px;
  }
}
</style>
