<script setup lang="ts">
// 電腦版接續留言（ux.md M5；spec US10）：不開彈窗，直接在留言卡片下方展開輸入框。
// 外觀與電腦版撰寫留言（PostComposer inline）相同；輸入狀態與手機面板共用 useCommentDraft。
import { onMounted, ref } from 'vue';
import type { Post } from '@/types/models';
import { ANONYMOUS, LIMITS } from '@/types/models';
import { useCommentDraft } from '@/composables/useCommentDraft';

const props = defineProps<{ post: Post }>();
const emit = defineEmits<{ close: [] }>();

const { body, nickname, sending, shownError, tooLong, canSend, placeholder, maxBody, submit } =
  useCommentDraft(() => props.post);

const textarea = ref<HTMLTextAreaElement | null>(null);
onMounted(() => textarea.value?.focus({ preventScroll: true }));

async function send() {
  if (await submit()) emit('close');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    void send();
  } else if (e.key === 'Escape') {
    emit('close'); // 草稿保留在 sessionStorage
  }
}
</script>

<template>
  <form class="inline" @submit.prevent="send">
    <div class="inline__box">
      <textarea
        ref="textarea"
        v-model="body"
        class="inline__text"
        rows="2"
        aria-label="接續留言內容"
        :placeholder="placeholder"
        :maxlength="maxBody + 50"
        @keydown="onKeydown"
      />
      <div class="inline__bar">
        <label class="inline__nick">
          <span class="sr-only">暱稱（選填）</span>
          <input
            v-model="nickname"
            class="inline__nick-input"
            :placeholder="`暱稱（選填，不填顯示${ANONYMOUS}）`"
            :maxlength="LIMITS.nickname"
            autocomplete="nickname"
            @keydown="onKeydown"
          />
        </label>
        <span class="inline__count" :class="{ 'inline__count--over': tooLong }"
          >{{ body.length }}/{{ maxBody }}</span
        >
        <button type="button" class="btn btn--text btn--muted" @click="emit('close')">取消</button>
        <button type="submit" class="btn btn--primary" :disabled="!canSend">
          <q-spinner v-if="sending" size="16px" />
          送出
        </button>
      </div>
    </div>
    <p v-if="shownError" class="field__error inline__error" role="alert">{{ shownError }}</p>
  </form>
</template>

<style scoped lang="scss">
.inline {
  margin-top: 12px;

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
    min-height: 64px;
    padding: 12px 14px 4px;
    border: 0;
    border-radius: var(--echo-radius);
    background: transparent;
    font: inherit;
    font-size: 16px;
    line-height: 1.6;
    resize: vertical;

    &:focus {
      outline: none;
    }
  }

  &__bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px 4px 14px;
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
    font-size: 15px;

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
