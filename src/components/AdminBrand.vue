<script setup lang="ts">
// 管理端品牌字樣（ux.md U1）：上方小字「世界之光聖教會」，下方「ECHO 管理」。
// 管理端頁首與側欄還要放「新增場次」、帳號選單，放不下會友端那種單行「世界之光聖教會 │ ECHO」，所以上下兩行。
withDefaults(defineProps<{ size?: 'md' | 'lg' }>(), { size: 'md' });
</script>

<template>
  <span class="ab" :class="`ab--${size}`">
    <span class="ab__church">世界之光聖教會</span>
    <span class="ab__name">ECHO <span class="ab__role">管理</span></span>
  </span>
</template>

<style scoped lang="scss">
.ab {
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
  color: var(--echo-text);
  line-height: 1.25;

  &__church {
    font-family: var(--echo-font-brand);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--echo-muted);
  }

  &__name {
    font-size: 16px;
    font-weight: 600;
  }

  &__role {
    color: var(--echo-muted);
  }

  &--lg {
    gap: 4px;

    .ab__church {
      font-size: 14px;
    }

    .ab__name {
      font-size: 20px;
    }
  }
}
</style>
