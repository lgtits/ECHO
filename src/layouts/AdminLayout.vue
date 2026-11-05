<script setup lang="ts">
// 管理端版型（ux.md §1.3、§2.1）：頂端 3px 綠色細條＋「ECHO 管理」；≥ 1280px 改為左側欄。
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { useSessionsStore } from '@/stores/sessions';
import AccountMenu from '@/components/AccountMenu.vue';
import SessionSidebar from '@/components/SessionSidebar.vue';

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
    <div class="admin__body">
      <SessionSidebar v-if="isWide" />
      <div class="admin__main">
        <header v-if="!isWide" class="admin__bar">
          <router-link to="/admin" class="admin__brand">ECHO <span>管理</span></router-link>
          <router-link
            v-if="route.path === '/admin'"
            to="/admin/sessions/new"
            class="btn btn--primary admin__new"
          >
            ＋ 新增場次
          </router-link>
          <AccountMenu />
        </header>
        <router-view />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.admin {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--echo-bg);

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
    display: flex;
    align-items: center;
    gap: 8px;
    height: 56px;
    padding: 0 8px 0 16px;
    border-bottom: 1px solid var(--echo-line);
  }

  &__brand {
    font-size: 16px;
    font-weight: 600;
    text-decoration: none;
    margin-right: auto;

    span {
      color: var(--echo-primary);
    }
  }

  &__new {
    min-height: 40px;
    padding: 0 14px;
    font-size: 14px;
  }
}
</style>
