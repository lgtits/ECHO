<script setup lang="ts">
// 會友端放大（AC9.6、AC9.7）：/s/:code/stage?post=<id>，唯讀小卡，不需登入，過去場次也可用。
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBoardStore } from '@/stores/board';
import { useAuthStore } from '@/stores/auth';
import StageView from '@/components/StageView.vue';
import { SORT_LABEL } from '@/utils/sortFilter';
import { formatShortDate } from '@/utils/time';

const route = useRoute();
const router = useRouter();
const board = useBoardStore();
const auth = useAuthStore();

const code = computed(() => String(route.params.code ?? '').toUpperCase());
const currentId = computed(() => (typeof route.query.post === 'string' ? route.query.post : null));

function setCurrent(id: string) {
  void router.replace({ query: { ...route.query, post: id } });
}

function close() {
  void router.push(`/s/${code.value}`);
}

onMounted(async () => {
  await auth.ensure();
  await board.open({ code: code.value }, 'member');
  if (board.status !== 'ready') return;
  if (currentId.value) board.ensureStageIncludes(currentId.value);
  else board.startStage();
  if (!currentId.value && board.stagePosts[0]) setCurrent(board.stagePosts[0].id);
});

onBeforeUnmount(() => board.endStage());
</script>

<template>
  <main v-if="board.status === 'not_found'" class="page missing">
    <h1>找不到此場次</h1>
    <router-link to="/" class="btn btn--primary btn--lg">回首頁輸入場次碼</router-link>
  </main>
  <div v-else-if="board.status !== 'ready'" class="loading">
    <q-spinner size="32px" color="primary" />
  </div>
  <StageView
    v-else-if="board.session"
    :posts="board.stagePosts"
    :current-id="currentId"
    :session-title="board.session.title"
    :session-date="formatShortDate(board.session.sermonDate)"
    :label="`放大 · ${SORT_LABEL[board.sort]}`"
    @update:current-id="setCurrent"
    @close="close"
  />
</template>

<style scoped>
.missing {
  padding-top: 64px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 20px;
}

.missing h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.loading {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--echo-stage);
}
</style>
