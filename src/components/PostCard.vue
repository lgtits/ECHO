<script setup lang="ts">
// 留言卡片：會友端與管理端共用（ux.md §1.3、§5）。
// 內容、暱稱、附議數、回覆的呈現兩種模式完全相同；admin 模式多一列操作。
// 牧者回覆與會友接續留言（spec US10）依時間排在下方：回覆是淺灰底區塊，接續留言是左側細線。
import { computed, ref } from 'vue';
import ClampText from './ClampText.vue';
import ActionIcon from './ActionIcon.vue';
import type { Post } from '@/types/models';
import { formatHm, formatPostTime } from '@/utils/time';
import { useClock } from '@/composables/useClock';

const props = withDefaults(
  defineProps<{
    post: Post;
    mode: 'member' | 'admin';
    /** 場次可寫入（開放中且未到自動結束）：會友模式才能附議、接續留言 */
    writable?: boolean;
    /** 管理端才能回覆 */
    canReply?: boolean;
    /** 回覆面板正開著這一則 */
    selected?: boolean;
  }>(),
  { writable: false, canReply: false, selected: false },
);

const emit = defineEmits<{
  upvote: [];
  reply: [];
  hide: [hidden: boolean];
  delete: [];
  deleteReply: [replyId: string];
  /** 會友模式：接續留言（AC10.1） */
  comment: [];
  /** 管理模式：隱藏／刪除會友的接續留言（AC10.7） */
  hideComment: [replyId: string, hidden: boolean];
  deleteComment: [replyId: string];
}>();

const clock = useClock();
const time = computed(() => formatPostTime(props.post.createdAt, new Date(clock.value)));
const who = computed(() => props.post.nickname || '匿名');

// 接續留言很多時收合（ux.md M2）：牧者回覆一律顯示，接續留言只留最近 2 則，
// 較早的收成「顯示其他 N 則留言」。至少藏 2 則才收合，避免出現「顯示其他 1 則」。
const COMMENT_PREVIEW = 2;
const expanded = ref(false);
const comments = computed(() => props.post.replies.filter((r) => r.authorKind === 'member'));
const collapsible = computed(() => comments.value.length > COMMENT_PREVIEW + 1);
const collapsedIds = computed(
  () =>
    new Set(
      collapsible.value && !expanded.value
        ? comments.value.slice(0, -COMMENT_PREVIEW).map((r) => r.id)
        : [],
    ),
);
const shownReplies = computed(() =>
  props.post.replies.filter((r) => !collapsedIds.value.has(r.id)),
);
</script>

<template>
  <article
    class="post"
    :class="{
      'post--hidden': post.isHidden,
      'post--selected': selected,
      'post--admin': mode === 'admin',
    }"
  >
    <div class="post__main">
      <div class="post__content">
        <span class="post__meta">
          <span>{{ who }} · {{ time }}</span>
          <span v-if="post.isHidden" class="post__hidden-label">
            已隱藏<template v-if="post.hiddenByName"> · {{ post.hiddenByName }}</template
            ><template v-if="post.hiddenAt"> {{ formatHm(new Date(post.hiddenAt)) }}</template>
          </span>
        </span>
        <span class="post__body">{{ post.body }}</span>
      </div>

      <!-- 管理模式：右側操作列（手機改到內容下方） -->
      <div v-if="mode === 'admin'" class="post__admin-actions">
        <!-- 附議數、回覆：與會友端相同的圖示＋數字（ux.md A4）；管理者不附議，箭頭只顯示 -->
        <span class="vote vote--static" :aria-label="`附議 ${post.upvoteCount}`">
          <ActionIcon name="upvote" />
          <span class="vote__count">{{ post.upvoteCount }}</span>
        </span>
        <button
          v-if="canReply"
          type="button"
          class="vote"
          :disabled="post.isHidden"
          :aria-label="`回覆，目前 ${post.replies.length} 則回應`"
          @click="emit('reply')"
        >
          <ActionIcon name="comment" />
          <span class="vote__count">{{ post.replies.length }}</span>
        </button>
        <button
          type="button"
          class="btn btn--text btn--muted"
          @click="emit('hide', !post.isHidden)"
        >
          {{ post.isHidden ? '取消隱藏' : '隱藏' }}
        </button>
        <button type="button" class="btn btn--text btn--danger" @click="emit('delete')">
          刪除
        </button>
      </div>
    </div>

    <!-- 會友模式：附議緊接在留言內容下方、回覆之前，才看得出是附議這則留言（ux.md §5） -->
    <div v-if="mode === 'member'" class="post__footer">
      <button
        type="button"
        class="vote"
        :class="{ 'vote--on': post.upvotedByMe }"
        :disabled="!writable"
        :aria-pressed="post.upvotedByMe"
        :aria-label="
          post.upvotedByMe
            ? `取消附議，目前 ${post.upvoteCount} 人附議`
            : `附議，目前 ${post.upvoteCount} 人附議`
        "
        @click="emit('upvote')"
      >
        <!-- 未附議中空、已附議填滿 -->
        <ActionIcon name="upvote" :filled="post.upvotedByMe" />
        <span class="vote__count">{{ post.upvoteCount }}</span>
      </button>
      <!-- 接續留言：右邊是回覆＋接續留言的則數；場次結束後停用（AC10.4） -->
      <button
        type="button"
        class="vote"
        :disabled="!writable"
        :aria-label="`接續留言，目前 ${post.replies.length} 則回應`"
        @click="emit('comment')"
      >
        <ActionIcon name="comment" />
        <span class="vote__count">{{ post.replies.length }}</span>
      </button>
    </div>

    <button
      v-if="collapsedIds.size"
      type="button"
      class="btn btn--text post__more"
      @click="expanded = true"
    >
      顯示其他 {{ collapsedIds.size }} 則留言
    </button>

    <template v-for="r in shownReplies" :key="r.id">
      <!-- 牧者回覆 -->
      <div v-if="r.authorKind === 'staff'" class="reply">
        <div class="reply__head">
          <span>{{ r.authorName }}回覆 · {{ formatPostTime(r.createdAt, new Date(clock)) }}</span>
          <!-- 管理模式：不必打開回覆面板就能刪除回覆（AC7.5） -->
          <button
            v-if="mode === 'admin'"
            type="button"
            class="btn btn--text btn--danger reply__delete"
            :aria-label="`刪除${r.authorName}的回覆`"
            @click="emit('deleteReply', r.id)"
          >
            刪除
          </button>
        </div>
        <ClampText class="reply__body" :text="r.body" :lines="3" />
      </div>

      <!-- 會友接續留言（spec US10） -->
      <div v-else class="comment" :class="{ 'comment--hidden': r.isHidden }">
        <div class="comment__head">
          <span class="comment__meta">
            {{ r.authorName }} · {{ formatPostTime(r.createdAt, new Date(clock)) }}
            <template v-if="r.isHidden">
              · 已隱藏<template v-if="r.hiddenAt"> {{ formatHm(new Date(r.hiddenAt)) }}</template>
            </template>
          </span>
          <!-- 管理模式：隱藏、刪除（AC10.7） -->
          <span v-if="mode === 'admin'" class="comment__actions">
            <button
              type="button"
              class="btn btn--text btn--muted comment__action"
              @click="emit('hideComment', r.id, !r.isHidden)"
            >
              {{ r.isHidden ? '取消隱藏' : '隱藏' }}
            </button>
            <button
              type="button"
              class="btn btn--text btn--danger comment__action"
              :aria-label="`刪除${r.authorName}的接續留言`"
              @click="emit('deleteComment', r.id)"
            >
              刪除
            </button>
          </span>
        </div>
        <ClampText class="comment__body" :text="r.body" :lines="3" />
      </div>
    </template>

    <button
      v-if="collapsible && expanded"
      type="button"
      class="btn btn--text post__more"
      @click="expanded = false"
    >
      收合留言
    </button>
  </article>
</template>

<style scoped lang="scss">
// 白色卡片，細框分隔
.post {
  margin-bottom: 8px;
  padding: 16px;
  border: 1px solid var(--echo-line);
  border-radius: var(--echo-radius-lg);
  background: var(--echo-bg);

  &--selected {
    border-color: var(--echo-primary);
    box-shadow: inset 0 0 0 1px var(--echo-primary);
  }

  &--hidden {
    background: var(--echo-subtle);
  }

  &--hidden .post__body,
  &--hidden .post__meta {
    color: var(--echo-faint);
  }

  &__main {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1 1 auto;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    font-size: 14px;
    color: var(--echo-muted);
  }

  &__hidden-label {
    color: var(--echo-muted);
  }

  &__body {
    font-size: 17px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  &__admin-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: -10px; // 第一個圖示與上方文字左緣對齊
  }

  // 「顯示其他 N 則留言」「收合留言」：文字與上方內容左緣對齊，觸控區 44px
  &__more {
    margin: 4px 0 -8px -12px;
    font-size: 14px;
    color: var(--echo-primary);
  }

  &__footer {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 6px 0 0 -10px; // 圖示與上方文字左緣對齊，觸控區仍是 44px
  }
}

// 平板以上：管理操作放右側（ux.md A4）
@media (min-width: 600px) {
  .post--admin .post__main {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .post--admin .post__admin-actions {
    margin-left: 0;
    flex-shrink: 0;
  }
}

.vote {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  min-width: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--echo-radius);
  background: transparent;
  color: var(--echo-muted);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  // 已附議：圖示與數字變深抹茶、數字加粗（不加外框、不加底色）
  &--on {
    color: var(--echo-primary);
    font-weight: 600;
  }

  // 圖示與數字垂直置中：兩者都用 line-height 1，不受內文行高影響
  // 管理端的附議數：只顯示，不能點
  &--static {
    cursor: default;
  }

  // 數字的字框上下留白不對稱（中文系統字型尤其明顯），只設 line-height 置中後看起來仍偏上或偏下；
  // 把字框裁成「數字頂端到基線」再置中，才會和圖示的中線對齊
  &__count {
    min-width: 1ch;
    line-height: 1;
    text-box: trim-both cap alphabetic;
  }

  &:disabled {
    cursor: default;
    color: var(--echo-faint);
  }

  &--on:disabled {
    color: var(--echo-primary);
  }
}

.reply {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: var(--echo-radius);
  background: var(--echo-subtle);

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  &__delete {
    margin: -10px -10px -10px 0; // 觸控區維持 44px，不撐高回覆區塊
    font-size: 14px;
    font-weight: 400;
  }

  &__body {
    font-size: 16px;
    line-height: 1.6;
  }
}

// 會友接續留言：不加底色，左側細線，和牧者回覆分得開（ux.md M2）
.comment {
  margin-top: 12px;
  padding: 2px 0 2px 12px;
  border-left: 2px solid var(--echo-line);

  &--hidden {
    color: var(--echo-faint);
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 2px;
  }

  &__meta {
    font-size: 14px;
    color: var(--echo-muted);
  }

  &--hidden &__meta {
    color: var(--echo-faint);
  }

  &__actions {
    display: flex;
    flex-shrink: 0;
    margin: -10px -10px -10px 0; // 觸控區維持 44px，不撐高
  }

  &__action {
    font-size: 14px;
  }

  &__body {
    font-size: 16px;
    line-height: 1.6;
  }
}
</style>
