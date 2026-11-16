<script setup lang="ts">
// A2 場次列表（ux.md A2；AC5.5）。開放中永遠置頂；待回應 > 0 粗體。
import { computed, ref } from 'vue';
import { useSessionsStore } from '@/stores/sessions';
import type { SessionStatus, SessionSummary } from '@/types/models';
import { formatAutoClose, formatShortDate } from '@/utils/time';

const sessions = useSessionsStore();

type Filter = 'all' | SessionStatus;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'open', label: '開放中' },
  { value: 'draft', label: '草稿' },
  { value: 'closed', label: '已結束' },
];
const STATUS_LABEL: Record<SessionStatus, string> = {
  open: '開放中',
  draft: '草稿',
  closed: '已結束',
};

const filter = ref<Filter>('all');
const q = ref('');

const list = computed(() =>
  sessions.adminSorted.filter(
    (s) =>
      (filter.value === 'all' || s.status === filter.value) &&
      (!q.value || s.title.includes(q.value.trim())),
  ),
);

const statusText = (s: SessionSummary) =>
  s.status === 'open' && s.autoCloseAt
    ? `開放中 · ${formatAutoClose(s.autoCloseAt)} 自動結束`
    : STATUS_LABEL[s.status];
</script>

<template>
  <main class="list-page">
    <div class="list-page__inner">
      <div class="filters">
        <div class="filters__tabs" role="tablist" aria-label="篩選場次">
          <button
            v-for="f in FILTERS"
            :key="f.value"
            type="button"
            role="tab"
            class="filters__tab"
            :class="{ 'filters__tab--on': filter === f.value }"
            :aria-selected="filter === f.value"
            @click="filter = f.value"
          >
            {{ f.label }}
          </button>
        </div>
        <label class="filters__search">
          <span class="sr-only">搜尋標題</span>
          <input v-model="q" class="input" type="search" placeholder="搜尋標題" />
        </label>
      </div>

      <div v-if="!sessions.adminLoaded" class="rows">
        <q-skeleton v-for="i in 4" :key="i" type="text" height="64px" />
      </div>

      <p v-else-if="!list.length" class="empty">
        {{
          q || filter !== 'all' ? '沒有符合的場次。' : '還沒有場次，按「＋ 新增場次」建立第一個。'
        }}
      </p>

      <div v-else class="rows">
        <router-link v-for="s in list" :key="s.id" :to="`/admin/sessions/${s.id}`" class="srow">
          <span class="srow__status">
            <span class="status-dot" :class="`status-dot--${s.status}`" />
            <span>{{ statusText(s) }}</span>
          </span>
          <span class="srow__date">{{ formatShortDate(s.sermonDate) }}</span>
          <span class="srow__title">{{ s.title }}</span>
          <span class="srow__counts">
            <template v-if="s.status === 'draft'">—</template>
            <template v-else>
              留言 {{ s.postCount }} · 待回應 <b v-if="s.pendingCount > 0">{{ s.pendingCount }}</b
              ><template v-else>0</template>
            </template>
          </span>
          <span class="srow__line">
            <span class="status-dot" :class="`status-dot--${s.status}`" />
            {{ statusText(s) }} · {{ formatShortDate(s.sermonDate) }}
            <template v-if="s.status !== 'draft'">
              · 留言 {{ s.postCount }} · 待回應 <b v-if="s.pendingCount > 0">{{ s.pendingCount }}</b
              ><template v-else>0</template>
            </template>
          </span>
          <span class="srow__chev" aria-hidden="true">›</span>
        </router-link>
      </div>
    </div>
    <router-view />
  </main>
</template>

<style scoped lang="scss">
.list-page {
  &__inner {
    max-width: 960px;
    padding: 16px 20px 40px;
  }
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--echo-line);

  &__tabs {
    display: flex;
    gap: 20px;
    overflow-x: auto;
  }

  &__tab {
    min-height: 44px;
    padding: 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    font-size: 15px;
    color: var(--echo-muted);
    cursor: pointer;
    white-space: nowrap;

    &--on {
      color: var(--echo-text);
      font-weight: 600;
      border-bottom-color: var(--echo-text);
    }
  }

  &__search {
    flex: 1 1 200px;
    max-width: 320px;

    .input {
      min-height: 40px;
      font-size: 15px;
    }
  }
}

.empty {
  padding: 48px 0;
  color: var(--echo-muted);
}

// 場次列表放在白色圓角面板裡（Matcha）
.rows {
  overflow: hidden;
  border: 1px solid var(--echo-line);
  border-radius: var(--echo-radius-lg);
  background: var(--echo-bg);
}

.srow {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    'title chev'
    'meta chev';
  align-items: center;
  column-gap: 12px;
  row-gap: 2px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--echo-line);
  text-decoration: none;

  &:last-child {
    border-bottom: 0;
  }

  &__title {
    grid-area: title;
    font-size: 17px;
    min-width: 0;
  }

  &__status,
  &__date,
  &__counts,
  &__line {
    font-size: 14px;
    color: var(--echo-muted);
  }

  // 手機：第二行合併顯示狀態 · 日期 · 計數
  &__line {
    grid-area: meta;

    .status-dot {
      margin-right: 4px;
      vertical-align: 1px;
    }
  }

  &__status,
  &__date,
  &__counts {
    display: none;
  }

  b {
    color: var(--echo-text);
  }

  &__chev {
    grid-area: chev;
    font-size: 22px;
    color: var(--echo-muted);
  }

  &:hover &__title {
    color: var(--echo-primary);
  }
}

// 平板以上：單行表格（ux.md A2）
@media (min-width: 600px) {
  .srow {
    grid-template-columns: 180px 56px 1fr auto 20px;
    grid-template-areas: 'status date title counts chev';
    min-height: 56px;

    &__status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      grid-area: status;
    }

    &__line {
      display: none;
    }

    &__date {
      display: block;
      grid-area: date;
      font-variant-numeric: tabular-nums;
    }

    &__counts {
      display: block;
      grid-area: counts;
    }
  }
}
</style>
