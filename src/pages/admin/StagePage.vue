<script setup lang="ts">
// 管理端講台模式（ux.md A7；AC9.1–9.5）：沿用進入時 A4 的篩選與排序，可文字回覆。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBoardStore } from '@/stores/board';
import StageView from '@/components/StageView.vue';
import ReplyEditor from '@/components/ReplyEditor.vue';
import { FILTER_LABEL, SORT_LABEL } from '@/utils/sortFilter';
import { formatShortDate } from '@/utils/time';

const route = useRoute();
const router = useRouter();
const board = useBoardStore();

const id = computed(() => String(route.params.id ?? ''));
const currentId = computed(() => (typeof route.query.post === 'string' ? route.query.post : null));
const replyOpen = ref(false);
const replyPost = computed(() => (currentId.value ? (board.get(currentId.value) ?? null) : null));

const label = computed(
  () =>
    `講台模式 · ${FILTER_LABEL[board.filter]} · 依${SORT_LABEL[board.sort].replace('最多', '')}排序`,
);

function setCurrent(postId: string) {
  void router.replace({ query: { ...route.query, post: postId } });
}

function close() {
  void router.push(`/admin/sessions/${id.value}`);
}

onMounted(async () => {
  await board.open({ id: id.value }, 'admin');
  if (board.status !== 'ready') return;
  if (currentId.value) board.ensureStageIncludes(currentId.value);
  else board.startStage();
  if (!currentId.value && board.stagePosts[0]) setCurrent(board.stagePosts[0].id);
});

onBeforeUnmount(() => board.endStage());
</script>

<template>
  <div v-if="board.status === 'not_found'" class="missing">
    <p>找不到這個場次。</p>
    <router-link to="/admin" class="btn btn--secondary">回場次列表</router-link>
  </div>
  <div v-else-if="board.status !== 'ready'" class="loading">
    <q-spinner size="32px" color="primary" />
  </div>
  <template v-else-if="board.session">
    <StageView
      :posts="board.stagePosts"
      :current-id="currentId"
      :session-title="board.session.title"
      :session-date="formatShortDate(board.session.sermonDate)"
      :label="label"
      can-reply
      @update:current-id="setCurrent"
      @close="close"
      @reply="replyOpen = true"
    />
    <!-- 文字回覆：送出後回到小卡，頁尾出現「已回應」 -->
    <q-dialog v-model="replyOpen" :maximized="$q.screen.lt.sm">
      <div class="reply-dialog">
        <ReplyEditor
          v-if="replyPost"
          :post="replyPost"
          autofocus
          @sent="replyOpen = false"
          @close="replyOpen = false"
        />
      </div>
    </q-dialog>
  </template>
</template>

<style scoped>
.missing {
  padding: 48px 24px;
}

.loading {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--echo-stage);
}

.reply-dialog {
  width: 560px;
  max-width: 100vw;
  padding: 20px 24px calc(20px + env(safe-area-inset-bottom));
  background: var(--echo-bg);
  border-radius: 8px;
}
</style>
