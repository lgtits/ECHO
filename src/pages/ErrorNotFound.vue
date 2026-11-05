<script setup lang="ts">
import MemberHeader from '@/components/MemberHeader.vue';
</script>

<template>
  <MemberHeader />
  <main class="not-found">
    <h1 class="not-found__title">找不到這個頁面</h1>
    <p class="text-muted">網址可能打錯了，或這個頁面已經不存在。</p>
    <q-btn to="/" label="回首頁" color="primary" unelevated no-caps class="not-found__btn" />
  </main>
</template>

<style scoped lang="scss">
.not-found {
  max-width: var(--echo-content-max);
  margin: 0 auto;
  padding: 48px 20px;

  &__title {
    margin: 0 0 8px;
    font-size: 22px;
    font-weight: 600;
    line-height: 1.35;
  }

  &__btn {
    margin-top: 20px;
    min-height: 48px;
    border-radius: 8px;
  }
}
</style>
