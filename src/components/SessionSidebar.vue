<script setup lang="ts">
// 筆電版左側欄（ux.md §2.1，≥ 1280px）：進行中／草稿／過去的場次直接切換。
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSessionsStore } from '@/stores/sessions';
import { formatShortDate } from '@/utils/time';
import AccountMenu from './AccountMenu.vue';

const route = useRoute();
const sessions = useSessionsStore();

const groups = computed(() => [
  { label: '進行中', items: sessions.adminSorted.filter((s) => s.status === 'open') },
  { label: '草稿', items: sessions.adminSorted.filter((s) => s.status === 'draft') },
  { label: '過去的場次', items: sessions.adminSorted.filter((s) => s.status === 'closed') },
]);
</script>

<template>
  <aside class="sidebar" aria-label="場次">
    <div class="sidebar__head">
      <router-link to="/admin" class="sidebar__brand">ECHO <span>管理</span></router-link>
      <router-link to="/admin/sessions/new" class="btn btn--secondary sidebar__new"
        >＋ 新增</router-link
      >
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
    <div class="sidebar__foot">
      <AccountMenu />
    </div>
  </aside>
</template>

<style scoped lang="scss">
.sidebar {
  position: sticky;
  top: 3px;
  width: 272px;
  height: calc(100vh - 3px);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--echo-line);
  background: var(--echo-bg);

  &__head {
    height: 64px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 16px 0 20px;
    border-bottom: 1px solid var(--echo-line);
  }

  &__brand {
    font-size: 16px;
    font-weight: 600;
    text-decoration: none;

    span {
      color: var(--echo-primary);
    }
  }

  &__new {
    margin-left: auto;
    min-height: 36px;
    padding: 0 12px;
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

  &__foot {
    padding: 8px;
    border-top: 1px solid var(--echo-line);
  }
}
</style>
