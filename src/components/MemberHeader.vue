<script setup lang="ts">
// 會友端頁首（ux.md §1.3）：白底、固定在頂端。
// 左邊 ECHO（有 back 時前面加 ‹，點了回首頁）；右邊放頁面動作。
// condensed 時把 ECHO 換成 title（留言板往下捲、看不到場次標題時）。
withDefaults(
  defineProps<{
    /** 顯示 ‹ 並連到這個路徑 */
    back?: string;
    /** condensed 時顯示的標題 */
    title?: string;
    condensed?: boolean;
  }>(),
  { title: '', condensed: false },
);
</script>

<template>
  <header class="mh">
    <div class="page mh__inner">
      <router-link
        :to="back ?? '/'"
        class="mh__home"
        :class="{ 'mh__home--back': back }"
        :aria-label="back ? '回場次列表' : 'ECHO 首頁'"
      >
        <span v-if="back" class="mh__chev" aria-hidden="true">‹</span>
        <span class="mh__brand" :class="{ 'mh__brand--out': condensed && title }">ECHO</span>
      </router-link>

      <span class="mh__title" :class="{ 'mh__title--in': condensed && title }" aria-hidden="true">
        {{ title }}
      </span>

      <div class="mh__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style scoped lang="scss">
.mh {
  position: sticky;
  top: 0;
  z-index: 25;
  background: var(--echo-bg);
  border-bottom: 1px solid var(--echo-line);

  &__inner {
    position: relative;
    display: flex;
    align-items: center;
    height: 56px;
  }

  &__home {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 44px;
    min-height: 44px;
    color: var(--echo-text);
    text-decoration: none;

    &--back {
      margin-left: -6px;
      padding-left: 6px;
    }
  }

  &__chev {
    font-size: 26px;
    line-height: 1;
    margin-top: -3px;
  }

  &__brand {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 1px;
    transition: opacity 0.15s ease;

    &--out {
      opacity: 0;
    }
  }

  // 標題疊在 ECHO 的位置，捲動後淡入
  &__title {
    position: absolute;
    left: 36px;
    right: 88px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;

    &--in {
      opacity: 1;
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    margin-left: auto;
    margin-right: -12px;
  }
}
</style>
