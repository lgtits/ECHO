<script setup lang="ts">
// 講台小卡（ux.md A7）：白色小卡、編號、細分隔線、頁尾資訊；一律不顯示暱稱（D2）。
import { computed } from 'vue';
import type { Post } from '@/types/models';
import { isAnswered } from '@/utils/sortFilter';

const props = defineProps<{
  post: Post | null;
  index: number;
  sessionTitle: string;
  sessionDate: string;
}>();

const no = computed(() => `Q.${String(props.index + 1).padStart(2, '0')}`);
const size = computed(() => {
  const n = props.post?.body.length ?? 0;
  return n > 140 ? 'xl' : n > 70 ? 'l' : 'm';
});
</script>

<template>
  <div
    class="card"
    :class="`card--${size}`"
    role="region"
    aria-roledescription="小卡"
    :aria-label="no"
  >
    <div class="card__head">
      <span>{{ post ? no : '' }}</span>
      <span>會友留言</span>
    </div>
    <div class="card__body" aria-live="polite">
      <template v-if="post">{{ post.body }}</template>
      <span v-else class="card__empty">目前沒有留言</span>
    </div>
    <div class="card__foot">
      <span v-if="post && isAnswered(post)" class="card__answered">已回應</span>
      <span v-else>{{ sessionTitle }} · {{ sessionDate }}</span>
      <span v-if="post" class="card__votes">↑ {{ post.upvoteCount }} 人也想知道</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.card {
  --q: 24px;
  width: 100%;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  padding: 24px 22px 18px;
  background: #fff;
  border-radius: var(--echo-radius-lg);
  box-shadow: var(--echo-card-shadow);
  color: var(--echo-text);

  &__head {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    letter-spacing: 1px;
    color: var(--echo-muted);
  }

  &__body {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 20px 0;
    font-size: var(--q);
    font-weight: 500;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  &--l &__body {
    font-size: calc(var(--q) * 0.82);
  }

  &--xl &__body {
    font-size: calc(var(--q) * 0.66);
  }

  &__empty {
    color: var(--echo-muted);
    font-size: 0.7em;
  }

  &__foot {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 16px;
    padding-top: 14px;
    border-top: 1px solid var(--echo-line);
    font-size: 14px;
    color: var(--echo-muted);
  }

  &__answered {
    color: var(--echo-success);
    font-weight: 600;
  }

  &__votes {
    color: var(--echo-text);
    font-variant-numeric: tabular-nums;
  }
}

// 16:10 橫式：平板以上，或手機橫拿（ux.md §2.1）
@mixin landscape($q, $pad, $head, $foot) {
  --q: #{$q};
  aspect-ratio: 16 / 10;
  min-height: 0;
  padding: $pad;

  .card__head {
    font-size: $head;
  }

  .card__foot {
    font-size: $foot;
  }
}

@media (min-width: 600px) {
  .card {
    @include landscape(30px, 32px 40px 26px, 14px, 15px);
  }
}

@media (min-width: 1024px) {
  .card {
    @include landscape(34px, 40px 48px 32px, 14px, 15px);
  }
}

@media (min-width: 1280px) {
  .card {
    @include landscape(42px, 52px 64px 40px, 15px, 16px);
  }
}

@media (max-width: 599px) and (orientation: landscape) {
  .card {
    @include landscape(22px, 18px 24px 14px, 12px, 13px);
  }
}
</style>
