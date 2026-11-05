<script setup lang="ts">
// 固定 QR 入口 /now（AC1.7）：導向目前開放中的場次；沒有時回首頁並提示。
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSessionsStore } from '@/stores/sessions';

const router = useRouter();
const sessions = useSessionsStore();

onMounted(async () => {
  try {
    const s = await sessions.findCurrent();
    await router.replace(s ? `/s/${s.code}` : { path: '/', query: { from: 'now' } });
  } catch {
    await router.replace({ path: '/', query: { from: 'now' } });
  }
});
</script>

<template>
  <main class="page now" aria-busy="true">
    <q-spinner size="28px" color="primary" />
    <p class="text-muted">正在前往目前的場次…</p>
  </main>
</template>

<style scoped>
.now {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 30vh;
}
</style>
