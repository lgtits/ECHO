<script setup lang="ts">
// 留言卡片的附議、留言／回覆圖示（ux.md M2、A4；會友端與管理端相同）。
// inline SVG，viewBox 裁到圖形本身，與數字垂直置中時才是圖形對齊（字型圖示做不到）。
// 顏色跟著文字色（currentColor）。
defineProps<{
  name: 'upvote' | 'comment';
  /** 附議箭頭：true 填滿（已附議），false 中空 */
  filled?: boolean;
}>();
</script>

<template>
  <!-- 粗箭頭：中空外框，已附議時填滿；viewBox 含 1px 外框 -->
  <svg
    v-if="name === 'upvote'"
    class="icon icon--arrow"
    :class="{ 'icon--filled': filled }"
    viewBox="2 2 20 20"
    width="17"
    height="17"
    aria-hidden="true"
  >
    <path d="M12 3 21 12h-5v9H8v-9H3z" />
  </svg>
  <!-- Material chat_bubble_outline -->
  <svg v-else class="icon" viewBox="2 2 20 20" width="17" height="17" aria-hidden="true">
    <path
      d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
    />
  </svg>
</template>

<style scoped lang="scss">
.icon {
  display: block;
  flex-shrink: 0;
  fill: currentColor;

  &--arrow path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
  }

  &--filled path {
    fill: currentColor;
  }
}
</style>
