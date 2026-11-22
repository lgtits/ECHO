<script setup lang="ts">
// 筆電版左側欄（ux.md §2.1，≥ 1280px）：在整頁寬的頁首下方，進行中／過去的場次直接切換。
// 品牌、帳號選單在頁首（AdminLayout）；「＋ 新增場次」放在側欄頂端。
// 不再有「草稿」分組（spec D17）；舊的草稿場次歸在「過去的場次」。
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSessionsStore } from '@/stores/sessions';
import { formatShortDate } from '@/utils/time';

const route = useRoute();
const sessions = useSessionsStore();

const groups = computed(() => [
  { label: '進行中', items: sessions.adminSorted.filter((s) => s.status === 'open') },
  { label: '過去的場次', items: sessions.adminSorted.filter((s) => s.status !== 'open') },
]);
</script>

<template>
  <aside class="sidebar" aria-label="場次">
    <div class="sidebar__actions">
      <router-link to="/admin/sessions/new" class="btn btn--primary sidebar__new">
        ＋ 新增場次
      </router-link>
    </div>
    <nav class="sidebar__list">
      <template v-for="g in groups" :key="g.label">
        <div v-if="g.items.length" class="sidebar__group">{{ g.label }}</div>
        <router-link
          v-for="s in g.items"
          :key="s.id"
          :to="`/admin/sessions/${s.id}`"
          class="sidebar__item"
          :class="{ 'sidebar__item--active': route.params.id === s.id }"
        >
          <span class="sidebar__title" :class="{ 'sidebar__title--strong': s.status === 'open' }">{{
            s.title
          }}</span>
          <span class="sidebar__meta">
            {{ formatShortDate(s.sermonDate)
            }}<template v-if="s.speaker"> · {{ s.speaker }}</template> · 待回應
            <b v-if="s.pendingCount > 0">{{ s.pendingCount }}</b
            ><template v-else>0</template>
          </span>
        </router-link>
      </template>
    </nav>
  </aside>
</template>

<style scoped lang="scss">
.sidebar {
  position: sticky;
  top: var(--admin-top, 59px); // 在頁首下方
  width: 272px;
  height: calc(100vh - var(--admin-top, 59px));
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--echo-line);
  background: var(--echo-bg);

  &__actions {
    flex-shrink: 0;
    padding: 16px 16px 4px;
  }

  // 與手機頁首的「＋ 新增場次」同色（主要按鈕），寬度填滿側欄
  &__new {
    width: 100%;
    min-height: 40px;
    font-size: 14px;
  }

  &__list {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 12px;
  }

  &__group {
    padding: 18px 20px 6px;
    font-size: 13px;
    color: var(--echo-muted);
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 20px;
    text-decoration: none;

    &:hover,
    &--active {
      background: var(--echo-subtle);
    }
  }

  &__title {
    font-size: 15px;

    &--strong {
      font-weight: 600;
    }
  }

  &__meta {
    font-size: 13px;
    color: var(--echo-muted);
  }
}
</style>
