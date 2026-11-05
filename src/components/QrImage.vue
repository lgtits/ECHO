<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { qrSvg } from '@/utils/qr';

const props = defineProps<{ text: string; label?: string }>();
const svg = ref('');

watchEffect(() => {
  void qrSvg(props.text).then((v) => (svg.value = v));
});
</script>

<template>
  <!-- svg 由 qrcode 套件依網址產生，不含使用者輸入的 HTML -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="qr" role="img" :aria-label="label ?? `QR code：${text}`" v-html="svg" />
</template>

<style scoped>
.qr {
  aspect-ratio: 1;
  line-height: 0;
}

.qr :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
