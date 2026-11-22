<script setup lang="ts">
// 管理端版型（ux.md §1.3、§2.1）：頂端 3px 深抹茶細條＋整頁寬的頁首（品牌、新增場次、帳號選單）；
// ≥ 1280px 在頁首下方多一條左側欄。
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { useSessionsStore } from '@/stores/sessions';
import AccountMenu from '@/components/AccountMenu.vue';
import SessionSidebar from '@/components/SessionSidebar.vue';
import AdminBrand from '@/components/AdminBrand.vue';

const route = useRoute();
const sessions = useSessionsStore();
const { isWide } = useBreakpoint();

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void sessions.loadAdmin();
  timer = setInterval(() => void sessions.loadAdmin(), 30000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
watch(
  () => route.fullPath,
  () => void sessions.loadAdmin(),
);
</script>

<template>
  <div class="admin">
    <div class="admin__strip" aria-hidden="true" />
    <!-- 頁首各尺寸都一樣、整頁寬；電腦版「新增場次」放在左側欄頂端 -->
    <header class="admin__bar">
      <router-link to="/admin" class="admin__brand"><AdminBrand /></router-link>
      <router-link
        v-if="!isWide && route.path === '/admin'"
        to="/admin/sessions/new"
        class="btn btn--primary admin__new"
      >
        ＋ 新增場次
      </router-link>
      <AccountMenu />
    </header>
    <div class="admin__body">
      <SessionSidebar v-if="isWide" />
      <div class="admin__main">
        <router-view />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.admin {
  // 固定在頂端的區塊總高度：頂端細條 3px＋頁首 56px（各尺寸相同）
  --admin-top: 59px;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--echo-page);

  &__strip {
    position: sticky;
    top: 0;
    z-index: 20;
    height: 3px;
    background: var(--echo-primary);
  }

  &__body {
    display: flex;
    align-items: flex-start;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__bar {
    position: sticky;
    top: 3px;
    z-index: 18;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 56px;
    background: var(--echo-bg);
    padding: 0 8px 0 16px;
    border-bottom: 1px solid var(--echo-line);
  }

  &__brand {
    text-decoration: none;
    margin-right: auto;
  }

  &__new {
    min-height: 40px;
    padding: 0 14px;
    font-size: 14px;
  }
}
</style>
