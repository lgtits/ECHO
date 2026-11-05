<script setup lang="ts">
// 全螢幕投影 QR（ux.md A6）：聚會開始時投影在大螢幕上。
import { onBeforeUnmount, onMounted } from 'vue';
import QrImage from './QrImage.vue';
import { displayUrl } from '@/utils/config';

defineProps<{ url: string; code: string; title: string }>();
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !document.fullscreenElement) emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  document.documentElement.requestFullscreen?.().catch(() => undefined);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
});
</script>

<template>
  <Teleport to="body">
    <div class="projector" role="dialog" aria-modal="true" aria-label="全螢幕投影 QR">
      <button
        type="button"
        class="btn btn--text btn--muted projector__close"
        @click="emit('close')"
      >
        關閉（Esc）
      </button>
      <div class="projector__qr">
        <QrImage :text="url" />
      </div>
      <div class="projector__text">
        <p class="projector__title">{{ title }}</p>
        <p class="projector__lead">掃描 QR code<br />提出問題、分享回應</p>
        <p class="projector__code-label">或在首頁輸入場次碼</p>
        <p class="projector__code">{{ code }}</p>
        <p class="projector__url">{{ displayUrl(url) }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.projector {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
  background: #fff;
  color: var(--echo-text);

  &__close {
    position: absolute;
    top: 12px;
    right: 12px;
  }

  &__qr {
    width: min(70vw, 55vh);
  }

  &__text {
    text-align: center;

    p {
      margin: 0;
    }
  }

  &__title {
    font-size: 18px;
    color: var(--echo-muted);
  }

  &__lead {
    margin-top: 8px !important;
    font-size: clamp(22px, 3.2vw, 40px);
    font-weight: 600;
    line-height: 1.4;
  }

  &__code-label {
    margin-top: 20px !important;
    font-size: 16px;
    color: var(--echo-muted);
  }

  &__code {
    font-size: clamp(32px, 4.5vw, 64px);
    font-weight: 600;
    letter-spacing: 0.12em;
    font-variant-numeric: tabular-nums;
  }

  &__url {
    font-size: 16px;
    color: var(--echo-muted);
  }
}

// 橫向螢幕：QR 在左、文字在右
@media (min-aspect-ratio: 4/3) {
  .projector {
    flex-direction: row;
    gap: 6vw;

    &__text {
      text-align: left;
    }
  }
}
</style>
