<script setup lang="ts">
// 回覆編輯器（ux.md A5；AC6.2、6.3、6.5）：電腦的場次管理頁右側面板。手機、平板與講台模式用 ReplySheet。
import { computed, nextTick, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { Post } from '@/types/models';
import { LIMITS } from '@/types/models';
import { useAuthStore } from '@/stores/auth';
import { useBoardStore } from '@/stores/board';
import { errorMessage } from '@/utils/errors';
import { formatPostTime } from '@/utils/time';

const props = defineProps<{ post: Post; autofocus?: boolean }>();
const emit = defineEmits<{ sent: []; close: [] }>();

const $q = useQuasar();
const auth = useAuthStore();
const board = useBoardStore();

const body = ref('');
const sending = ref(false);
const error = ref('');
const editingId = ref<string | null>(null);
const editBody = ref('');
const textarea = ref<HTMLTextAreaElement | null>(null);

const tooLong = computed(() => body.value.length > LIMITS.replyBody);
const canSend = computed(() => !!body.value.trim() && !tooLong.value && !sending.value);

watch(
  () => props.post.id,
  async () => {
    body.value = '';
    error.value = '';
    editingId.value = null;
    if (props.autofocus) {
      await nextTick();
      textarea.value?.focus();
    }
  },
  { immediate: true },
);

async function send() {
  if (!canSend.value) return;
  sending.value = true;
  error.value = '';
  try {
    await board.addReply(props.post.id, body.value);
    body.value = '';
    $q.notify({ message: '已送出回覆' });
    emit('sent');
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    sending.value = false;
  }
}

function startEdit(id: string, text: string) {
  editingId.value = id;
  editBody.value = text;
}

async function saveEdit() {
  if (!editingId.value || !editBody.value.trim()) return;
  try {
    await board.updateReply(props.post.id, editingId.value, editBody.value);
    editingId.value = null;
  } catch (e) {
    $q.notify({ message: errorMessage(e) });
  }
}

function confirmDelete(id: string) {
  $q.dialog({
    title: '刪除這則回覆？',
    message: '刪除後會友就看不到這則回覆了。',
    cancel: { label: '取消', flat: true, noCaps: true, color: 'dark' },
    ok: { label: '刪除', flat: true, noCaps: true, color: 'negative' },
  }).onOk(() => {
    board
      .deleteReply(props.post.id, id)
      .catch((e: unknown) => $q.notify({ message: errorMessage(e) }));
  });
}

function onKeydown(e: KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    action();
  }
}
</script>

<template>
  <div class="editor">
    <div class="editor__head">
      <span class="editor__title">回覆</span>
      <button type="button" class="btn btn--text btn--muted" @click="emit('close')">關閉</button>
    </div>

    <!-- 原留言固定在上方，避免回覆時看不到題目 -->
    <div class="editor__question">
      <div class="editor__meta">
        {{ post.nickname || '匿名' }} · {{ formatPostTime(post.createdAt) }} · ↑
        {{ post.upvoteCount }}
      </div>
      <div class="editor__question-body">{{ post.body }}</div>
    </div>

    <ul v-if="post.replies.length" class="editor__replies">
      <li v-for="r in post.replies" :key="r.id" class="editor__reply">
        <div class="editor__meta">{{ r.authorName }} · {{ formatPostTime(r.createdAt) }}</div>
        <template v-if="editingId === r.id">
          <textarea
            v-model="editBody"
            class="input"
            rows="4"
            aria-label="編輯回覆"
            @keydown="onKeydown($event, saveEdit)"
          />
          <div class="editor__row">
            <button type="button" class="btn btn--text btn--muted" @click="editingId = null">
              取消
            </button>
            <button
              type="button"
              class="btn btn--primary"
              :disabled="!editBody.trim()"
              @click="saveEdit"
            >
              儲存
            </button>
          </div>
        </template>
        <template v-else>
          <div class="editor__reply-body">{{ r.body }}</div>
          <div v-if="r.authorId === auth.viewer?.uid" class="editor__row editor__row--start">
            <button type="button" class="btn btn--text" @click="startEdit(r.id, r.body)">
              編輯
            </button>
            <button type="button" class="btn btn--text btn--danger" @click="confirmDelete(r.id)">
              刪除
            </button>
          </div>
        </template>
      </li>
    </ul>

    <form class="editor__form" @submit.prevent="send">
      <label for="reply-body" class="field__label">回覆內容（會顯示在這則留言下方）</label>
      <textarea
        id="reply-body"
        ref="textarea"
        v-model="body"
        class="input editor__textarea"
        :class="{ 'input--invalid': tooLong }"
        @keydown="onKeydown($event, send)"
      />
      <p v-if="error" class="field__error" role="alert">{{ error }}</p>
      <div class="editor__row">
        <span class="editor__hint">
          <span class="editor__shortcut">Ctrl + Enter 送出 · </span>{{ body.length }}/{{
            LIMITS.replyBody
          }}
        </span>
        <button type="submit" class="btn btn--primary" :disabled="!canSend">
          <q-spinner v-if="sending" size="16px" />
          送出回覆
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped lang="scss">
.editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: -8px -8px -8px 0;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
  }

  &__question {
    padding-bottom: 16px;
    border-bottom: 1px solid var(--echo-line);
  }

  &__meta {
    font-size: 13px;
    color: var(--echo-muted);
    margin-bottom: 4px;
  }

  &__question-body {
    font-size: 16px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  &__replies {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__reply {
    padding: 12px 14px;
    border-radius: 6px;
    background: var(--echo-subtle);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__reply-body {
    font-size: 15px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  &__form {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 200px;
  }

  &__textarea {
    flex: 1;
    min-height: 140px;
    resize: none;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;

    &--start {
      justify-content: flex-start;
      margin-left: -12px;
    }
  }

  &__hint {
    margin-right: auto;
    font-size: 13px;
    color: var(--echo-muted);
    font-variant-numeric: tabular-nums;
  }
}

@media (pointer: coarse) {
  .editor__shortcut {
    display: none;
  }
}
</style>
