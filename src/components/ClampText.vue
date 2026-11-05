<script setup lang="ts">
// 超過指定行數時收合，並顯示「展開全文」（ux.md M2：回覆超過 3 行收合）。
// 以實際排版量測是否溢出，不同螢幕寬度都準確。
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ text: string; lines?: number }>(), { lines: 3 });

const el = ref<HTMLElement | null>(null);
const expanded = ref(false);
const overflowing = ref(false);
let observer: ResizeObserver | null = null;

function measure() {
  const node = el.value;
  if (!node || expanded.value) return;
  overflowing.value = node.scrollHeight > node.clientHeight + 1;
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined' && el.value) {
    observer = new ResizeObserver(measure);
    observer.observe(el.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
watch(
  () => props.text,
  () => requestAnimationFrame(measure),
);
</script>

<template>
  <div>
    <div
      ref="el"
      class="clamp"
      :class="{ 'clamp--on': !expanded }"
      :style="{ '-webkit-line-clamp': lines, 'line-clamp': lines }"
    >
      {{ text }}
    </div>
    <button
      v-if="overflowing || expanded"
      type="button"
      class="clamp__toggle"
      @click="expanded = !expanded"
    >
      {{ expanded ? '收合' : '展開全文' }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.clamp {
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  &--on {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__toggle {
    min-height: 36px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--echo-primary);
    font-size: 14px;
    cursor: pointer;
  }
}
</style>
