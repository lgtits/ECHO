<script setup lang="ts">
// 接續留言（ux.md M5；spec US10）：會友在別人的留言底下接著寫。手機、平板用。
// 外觀與撰寫留言相同（ComposeSheet）。上方只顯示原留言（最多 3 行），不列出底下的回覆與接續留言：
// iOS 上可捲動的區塊很難捲、還會帶動後面的頁面，所以上方不做捲動（2026-11-23）。
// 電腦不開面板，直接在卡片下方展開（CommentInline）；輸入狀態共用 useCommentDraft。
import { watch } from 'vue';
import type { Post } from '@/types/models';
import { ANONYMOUS, LIMITS } from '@/types/models';
import { formatPostTime } from '@/utils/time';
import { useCommentDraft } from '@/composables/useCommentDraft';
import ComposeSheet from './ComposeSheet.vue';

const props = defineProps<{ post: Post }>();
const open = defineModel<boolean>({ default: false });

const { body, nickname, sending, error, shownError, tooLong, canSend, placeholder, maxBody, submit } =
  useCommentDraft(() => props.post);

watch(open, (v) => {
  if (v) error.value = '';
});

async function send() {
  if (await submit()) open.value = false;
}
</script>

<template>
  <ComposeSheet
    v-model="open"
    fixed-context
    v-model:body="body"
    title="接續留言"
    text-label="接續留言內容"
    :placeholder="placeholder"
    :maxlength="maxBody + 50"
    :can-send="canSend"
    :sending="sending"
    :error="shownError"
    @submit="send"
  >
    <!-- 只顯示原留言 -->
    <template #context>
      <div class="ctx__meta">
        {{ post.nickname || ANONYMOUS }} · {{ formatPostTime(post.createdAt) }} · ↑
        {{ post.upvoteCount }}
      </div>
      <div class="ctx__body">{{ post.body }}</div>
    </template>

    <template #footer>
      <label class="ctx__name">
        <span class="sr-only">暱稱（選填）</span>
        <input
          v-model="nickname"
          class="ctx__name-input"
          :placeholder="`暱稱（選填，不填顯示${ANONYMOUS}）`"
          :maxlength="LIMITS.nickname"
          autocomplete="nickname"
          enterkeyhint="done"
        />
      </label>
      <span class="ctx__count" :class="{ 'ctx__count--over': tooLong }">
        {{ body.length }}/{{ maxBody }}
      </span>
    </template>
  </ComposeSheet>
</template>

<style scoped lang="scss">
.ctx {
  &__meta {
    margin-bottom: 4px;
    font-size: 13px;
    color: var(--echo-muted);
  }

  // 最多 3 行，上方區塊不需要捲動
  &__body {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    font-size: 16px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  &__name {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }


  &__name-input {
    flex: 1;
    width: 100%;
    min-width: 0;
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
}
</style>
