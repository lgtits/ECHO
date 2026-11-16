<script setup lang="ts">
// 篩選列＋排序（spec AC3.3、AC6.1、D13）：會友端與管理端共用，外觀一致。
import {
  FILTER_LABEL,
  SORT_LABEL,
  type FilterCounts,
  type PostFilter,
  type PostSort,
} from '@/utils/sortFilter';

defineProps<{
  filters: PostFilter[];
  sorts: PostSort[];
  counts: FilterCounts;
}>();

/** 按鈕上用短字，手機上四個篩選才放得下；選單裡用完整名稱 */
const SORT_SHORT: Record<PostSort, string> = { newest: '最新', top: '附議', oldest: '最舊' };

const filter = defineModel<PostFilter>('filter', { required: true });
const sort = defineModel<PostSort>('sort', { required: true });
</script>

<template>
  <nav class="tabs" aria-label="篩選留言">
    <div class="tabs__list">
      <button
        v-for="f in filters"
        :key="f"
        type="button"
        class="tabs__tab"
        :class="{ 'tabs__tab--on': filter === f }"
        :aria-pressed="filter === f"
        @click="filter = f"
      >
        {{ FILTER_LABEL[f] }} <span class="tabs__n">{{ counts[f] }}</span>
      </button>
    </div>
    <button
      type="button"
      class="btn btn--text tabs__sort"
      :aria-label="`排序方式：${SORT_LABEL[sort]}`"
    >
      {{ SORT_SHORT[sort] }} ▾
      <q-menu anchor="bottom right" self="top right">
        <q-list style="min-width: 140px">
          <q-item
            v-for="opt in sorts"
            :key="opt"
            v-close-popup
            clickable
            :active="sort === opt"
            active-class="text-primary"
            @click="sort = opt"
          >
            <q-item-section>{{ SORT_LABEL[opt] }}</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </button>
  </nav>
</template>

<style scoped lang="scss">
.tabs {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--echo-line);

  &__list {
    display: flex;
    gap: 16px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  &__tab {
    min-height: 48px;
    margin-bottom: -1px;
    padding: 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    font-size: 15px;
    color: var(--echo-muted);
    white-space: nowrap;
    cursor: pointer;

    &--on {
      color: var(--echo-text);
      font-weight: 600;
      border-bottom-color: var(--echo-text);
    }
  }

  &__n {
    font-variant-numeric: tabular-nums;
  }

  &__sort {
    flex: none;
    margin-left: auto;
    margin-right: -12px;
    padding-left: 8px;
    padding-right: 12px;
    font-size: 14px;
    white-space: nowrap;
  }
}

// 360px 手機：管理端四個篩選＋排序也要放得下
@media (max-width: 400px) {
  .tabs__list {
    gap: 12px;
  }

  .tabs__tab {
    font-size: 14px;
  }
}
</style>
