<script setup lang="ts">
// 帳號選單：登出；假資料模式另有示範工具（plan §6.1）。
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { services } from '@/services';
import { useAuthStore } from '@/stores/auth';

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();
const demo = services.demo;
const live = ref(demo?.isLiveActivity() ?? false);

async function signOut() {
  await auth.signOut();
  await router.push('/admin/login');
}

function toggleLive() {
  live.value = !live.value;
  demo?.setLiveActivity(live.value);
  $q.notify({ message: live.value ? '已開啟模擬會友活動' : '已關閉模擬會友活動' });
}

function reset() {
  $q.dialog({
    title: '重設示範資料？',
    message: '所有場次、留言與回覆會恢復成初始的示範內容。',
    cancel: { label: '取消', flat: true, noCaps: true, color: 'dark' },
    ok: { label: '重設', flat: true, noCaps: true, color: 'negative' },
  }).onOk(() => {
    demo?.reset();
    window.location.assign(router.resolve('/admin').href);
  });
}
</script>

<template>
  <button type="button" class="btn btn--text account">
    {{ auth.displayName }}<span aria-hidden="true">▾</span>
    <q-menu anchor="bottom right" self="top right">
      <q-list style="min-width: 220px">
        <q-item-label header>管理帳號</q-item-label>
        <q-item v-close-popup clickable @click="signOut">
          <q-item-section>登出</q-item-section>
        </q-item>
        <template v-if="demo">
          <q-separator />
          <q-item-label header>示範工具（假資料模式）</q-item-label>
          <q-item clickable @click="toggleLive">
            <q-item-section>模擬會友活動</q-item-section>
            <q-item-section side>{{ live ? '開' : '關' }}</q-item-section>
          </q-item>
          <q-item v-close-popup clickable @click="demo.simulateDisconnect(6)">
            <q-item-section>模擬斷線 6 秒</q-item-section>
          </q-item>
          <q-item v-close-popup clickable @click="reset">
            <q-item-section class="text-negative">重設示範資料</q-item-section>
          </q-item>
        </template>
      </q-list>
    </q-menu>
  </button>
</template>

<style scoped>
.account {
  gap: 4px;
  font-size: 14px;
}
</style>
