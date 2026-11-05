<script setup lang="ts">
// 留言卡片：會友端與管理端共用（ux.md §1.3、§5）。
// 內容、暱稱、附議數、回覆的呈現兩種模式完全相同；admin 模式多一列操作。
import { computed } from 'vue';
import ClampText from './ClampText.vue';
import type { Post } from '@/types/models';
import { isAnswered } from '@/utils/sortFilter';
import { formatHm, formatPostTime } from '@/utils/time';
import { useClock } from '@/composables/useClock';

const props = withDefaults(
  defineProps<{
    post: Post;
    mode: 'member' | 'admin';
    /** 場次可寫入（開放中且未到自動結束） */
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
  zoom: [];
  reply: [];
  hide: [hidden: boolean];
}>();

const clock = useClock();
const time = computed(() => formatPostTime(props.post.createdAt, new Date(clock.value)));
const answered = computed(() => isAnswered(props.post));
const who = computed(() => props.post.nickname || '匿名');
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
      <component
        :is="mode === 'admin' ? 'button' : 'div'"
        :type="mode === 'admin' ? 'button' : undefined"
        class="post__content"
        :aria-label="mode === 'admin' ? '放大成小卡' : undefined"
        @click="mode === 'admin' && emit('zoom')"
      >
        <span class="post__meta">
          <span>{{ who }} · {{ time }}</span>
          <span v-if="post.isHidden" class="post__hidden-label">
            已隱藏<template v-if="post.hiddenByName"> · {{ post.hiddenByName }}</template
            ><template v-if="post.hiddenAt"> {{ formatHm(new Date(post.hiddenAt)) }}</template>
          </span>
        </span>
        <span class="post__body">{{ post.body }}</span>
      </component>

      <!-- 管理模式：右側操作列（手機改到內容下方） -->
      <div v-if="mode === 'admin'" class="post__admin-actions">
        <span class="post__count" :aria-label="`附議 ${post.upvoteCount}`"
          >↑ {{ post.upvoteCount }}</span
        >
        <button v-if="!post.isHidden" type="button" class="btn btn--text" @click="emit('zoom')">
          放大
        </button>
        <button
          v-if="canReply && !post.isHidden"
          type="button"
          class="btn btn--text"
          @click="emit('reply')"
        >
          回覆
        </button>
        <button
          type="button"
          class="btn btn--text btn--muted"
          @click="emit('hide', !post.isHidden)"
        >
          {{ post.isHidden ? '取消隱藏' : '隱藏' }}
        </button>
      </div>
    </div>

    <!-- 回覆 -->
    <div v-for="r in post.replies" :key="r.id" class="reply">
      <div class="reply__head">
        {{ r.authorName }}回覆 · {{ formatPostTime(r.createdAt, new Date(clock)) }}
      </div>
      <ClampText class="reply__body" :text="r.body" :lines="3" />
    </div>

    <!-- 會友模式：底部操作 -->
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
        ↑ {{ post.upvoteCount }}<span v-if="post.upvotedByMe"> 已附議</span>
      </button>
      <span class="post__spacer" />
      <span v-if="answered" class="post__answered">已回應</span>
      <button type="button" class="btn btn--text btn--muted" @click="emit('zoom')">放大</button>
    </div>
    <div v-else-if="answered" class="post__footer post__footer--admin">
      <span class="post__spacer" />
      <span class="post__answered">已回應</span>
    </div>
  </article>
</template>

<style scoped lang="scss">
.post {
  padding: 16px 0;
  border-bottom: 1px solid var(--echo-line);

  &--selected {
    background: var(--echo-subtle);
  }

  &--hidden .post__body,
  &--hidden .post__meta {
    color: #a3a39d;
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

  &--admin &__content {
    cursor: pointer;
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
    margin-left: -12px;
  }

  &__count {
    min-width: 52px;
    padding-left: 12px;
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  &__footer {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;

    &--admin {
      margin-top: 6px;
    }
  }

  &__spacer {
    flex: 1;
  }

  &__answered {
    padding: 0 8px;
    font-size: 14px;
    color: var(--echo-primary);
    font-weight: 600;
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
  min-height: 44px;
  min-width: 64px;
  padding: 0 14px;
  border: 1px solid var(--echo-border);
  border-radius: 8px;
  background: var(--echo-bg);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &--on {
    border-color: var(--echo-primary);
    color: var(--echo-primary);
    font-weight: 600;
  }

  &:disabled {
    cursor: default;
    color: var(--echo-muted);
    border-color: var(--echo-line);
  }
}

.reply {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 6px;
  background: var(--echo-subtle);

  &__head {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  &__body {
    font-size: 16px;
    line-height: 1.6;
  }
}
</style>
