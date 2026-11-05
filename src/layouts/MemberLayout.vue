<script setup lang="ts">
// 會友端版型（ux.md §1.3）：沒有選單，只有場次資訊和留言。
</script>

<template>
  <div class="member-layout">
    <router-view />
  </div>
</template>

<style scoped>
.member-layout {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--echo-bg);
}
</style>
