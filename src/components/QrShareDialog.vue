<script setup lang="ts">
// 分享 QR 對話框（ux.md A6；AC5.4）。網址一律用 SITE_URL（plan §7.1）。
import { computed, ref } from 'vue';
import { copyToClipboard, useQuasar } from 'quasar';
import type { Session } from '@/types/models';
import { buildNowUrl, buildSessionUrl } from '@/utils/sessionUrl';
import { displayUrl, siteUrl } from '@/utils/config';
import { downloadPng, downloadSvg } from '@/utils/qr';
import QrImage from './QrImage.vue';
import QrProjector from './QrProjector.vue';

const props = defineProps<{ session: Session; modelValue: boolean; opening?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; 'open-session': [] }>();

const $q = useQuasar();
const open = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) });
const url = computed(() => buildSessionUrl(siteUrl(), props.session.code));
const nowUrl = computed(() => buildNowUrl(siteUrl()));
const projecting = ref(false);

// q-dialog 的圖層比全螢幕投影高，先關掉對話框再投影；關閉投影後回到對話框
function startProjecting() {
  open.value = false;
  projecting.value = true;
}
function stopProjecting() {
  projecting.value = false;
  open.value = true;
}

async function copy() {
  try {
    await copyToClipboard(url.value);
    $q.notify({ message: '已複製連結' });
  } catch {
    $q.notify({ message: '無法複製，請手動選取網址' });
  }
}
</script>

<template>
  <q-dialog v-model="open" :maximized="$q.screen.lt.sm">
    <div class="share" role="document">
      <div class="share__head">
        <h2 class="share__title">分享場次：{{ session.title }}</h2>
        <button type="button" class="btn btn--text btn--muted" @click="open = false">關閉</button>
      </div>

      <div v-if="session.status === 'draft'" class="share__warn">
        <span>場次尚未開放，會友掃碼後會看到「找不到此場次」。</span>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="opening"
          @click="emit('open-session')"
        >
          立即開放
        </button>
      </div>

      <div class="share__qr">
        <QrImage :text="url" />
      </div>
      <div class="share__code">
        <span class="share__code-label">場次碼</span>
        <span class="share__code-value">{{ session.code }}</span>
      </div>
      <p class="share__url">{{ url }}</p>

      <div class="share__actions">
        <button type="button" class="btn btn--primary" @click="startProjecting">
          全螢幕投影
        </button>
        <button type="button" class="btn btn--secondary" @click="copy">複製連結</button>
        <button
          type="button"
          class="btn btn--secondary"
          @click="downloadPng(url, `echo-${session.code}.png`)"
        >
          下載 PNG
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          @click="downloadSvg(url, `echo-${session.code}.svg`)"
        >
          下載 SVG
        </button>
      </div>

      <hr class="hairline" />
      <div class="share__fixed">
        <div>
          <div class="share__fixed-title">固定 QR</div>
          <div class="share__fixed-desc">
            {{ displayUrl(nowUrl) }} 永遠帶到目前開放中的場次，可以印在海報、桌卡上長期使用。
          </div>
        </div>
        <button
          type="button"
          class="btn btn--secondary"
          @click="downloadSvg(nowUrl, 'echo-now.svg')"
        >
          下載 SVG
        </button>
      </div>
    </div>
  </q-dialog>

  <QrProjector
    v-if="projecting"
    :url="url"
    :code="session.code"
    :title="session.title"
    @close="stopProjecting"
  />
</template>

<style scoped lang="scss">
.share {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 480px;
  max-width: 100%;
  padding: 20px 24px 24px;
  background: var(--echo-bg);
  border-radius: var(--echo-radius);

  &__head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__title {
    flex: 1;
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.4;
  }

  &__warn {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--echo-border);
    border-radius: var(--echo-radius-sm);
    font-size: 15px;

    span {
      flex: 1 1 200px;
    }
  }

  &__qr {
    width: 220px;
    align-self: center;
  }

  &__code {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 12px;
  }

  &__code-label {
    font-size: 14px;
    color: var(--echo-muted);
  }

  &__code-value {
    font-size: 28px;
    font-weight: 600;
    letter-spacing: 0.1em;
    font-variant-numeric: tabular-nums;
  }

  &__url {
    margin: -8px 0 0;
    text-align: center;
    font-size: 14px;
    color: var(--echo-muted);
    overflow-wrap: anywhere;
  }

  &__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  &__fixed {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  &__fixed-title {
    font-size: 15px;
    font-weight: 600;
  }

  &__fixed-desc {
    font-size: 14px;
    color: var(--echo-muted);
  }
}
</style>
