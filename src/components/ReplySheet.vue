<script setup lang="ts">
// 回覆（ux.md A5；AC6.2、6.3、6.5）：手機、平板與講台模式用。
// 外觀與會友撰寫留言相同（ComposeSheet）；電腦的場次管理頁仍用右側面板 ReplyEditor。
// 編輯已有回覆時載入同一個輸入框，小螢幕上只會有一個輸入框。
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { Post, Reply } from '@/types/models';
import { DEFAULT_REPLY_AUTHOR, LIMITS } from '@/types/models';
import { useAuthStore } from '@/stores/auth';
import { useBoardStore } from '@/stores/board';
import { errorMessage } from '@/utils/errors';
import { formatPostTime } from '@/utils/time';
import { useReplyAuthor } from '@/composables/useReplyAuthor';
import ComposeSheet from './ComposeSheet.vue';

const props = defineProps<{ post: Post }>();
const open = defineModel<boolean>({ default: false });
const emit = defineEmits<{ hide: [] }>();

const $q = useQuasar();
const auth = useAuthStore();
const board = useBoardStore();
const authorName = useReplyAuthor();

// 每則留言各自的回覆草稿，不小心關掉也不會遺失
const draftKey = computed(() => `echo.replyDraft.${props.post.id}`);
function readDraft(): string {
  try {
    return sessionStorage.getItem(draftKey.value) ?? '';
  } catch {
    return '';
  }
}
function writeDraft(v: string) {
  try {
    if (v) sessionStorage.setItem(draftKey.value, v);
    else sessionStorage.removeItem(draftKey.value);
  } catch {
    // 無痕模式等情況
  }
}

const body = ref(readDraft());
const editingId = ref<string | null>(null);
const sending = ref(false);
const error = ref('');
const sheet = ref<{ focus: () => void } | null>(null);

// 編輯舊回覆時不覆寫新回覆的草稿
watch(body, (v) => {
  if (!editingId.value) writeDraft(v);
});

watch(
  () => props.post.id,
  () => {
    editingId.value = null;
    error.value = '';
    body.value = readDraft();
  },
);

const tooLong = computed(() => body.value.length > LIMITS.replyBody);
const canSend = computed(() => !!body.value.trim() && !tooLong.value && !sending.value);
const isMine = (r: Reply) => r.authorKind === 'staff' && r.authorId === auth.viewer?.uid;
// 編輯舊回覆時名稱不變（spec D18），只顯示
const editingAuthor = computed(
  () => props.post.replies.find((r) => r.id === editingId.value)?.authorName ?? '',
);

function startEdit(r: Reply) {
  editingId.value = r.id;
  body.value = r.body;
  error.value = '';
  sheet.value?.focus();
}

function stopEdit() {
  editingId.value = null;
  error.value = '';
  body.value = readDraft();
}

async function submit() {
  if (!canSend.value) return;
  sending.value = true;
  error.value = '';
  try {
    if (editingId.value) {
      await board.updateReply(props.post.id, editingId.value, body.value);
      $q.notify({ message: '已儲存回覆' });
      stopEdit();
    } else {
      await board.addReply(props.post.id, body.value, authorName.value);
      body.value = '';
      $q.notify({ message: '已送出回覆' });
      open.value = false;
    }
  } catch (e) {
    error.value = errorMessage(e); // 失敗時保留內容
  } finally {
    sending.value = false;
  }
}

function confirmDelete(id: string) {
  $q.dialog({
    title: '刪除這則回覆？',
    message: '刪除後會友就看不到這則回覆了。',
    cancel: { label: '取消', flat: true, noCaps: true, color: 'dark' },
    ok: { label: '刪除', flat: true, noCaps: true, color: 'negative' },
  }).onOk(() => {
    if (editingId.value === id) stopEdit();
    board
      .deleteReply(props.post.id, id)
      .catch((e: unknown) => $q.notify({ message: errorMessage(e) }));
  });
}

function onHide() {
  if (editingId.value) stopEdit();
  emit('hide');
}
</script>

<template>
  <ComposeSheet
    ref="sheet"
    v-model="open"
    v-model:body="body"
    :title="editingId ? '編輯回覆' : '回覆留言'"
    :send-label="editingId ? '儲存' : '送出'"
    text-label="回覆內容"
    placeholder="回覆會顯示在這則留言下方，會友即時看得到"
    :maxlength="LIMITS.replyBody + 50"
    :can-send="canSend"
    :sending="sending"
    :error="error"
    @submit="submit"
    @hide="onHide"
  >
    <!-- 原留言固定在上方，避免回覆時看不到題目 -->
    <template #context>
      <div class="ctx__meta">
        {{ post.nickname || '匿名' }} · {{ formatPostTime(post.createdAt) }} · ↑
        {{ post.upvoteCount }}
      </div>
      <div class="ctx__body">{{ post.body }}</div>

      <ul v-if="post.replies.length" class="ctx__replies">
        <li
          v-for="r in post.replies"
          :key="r.id"
          class="ctx__reply"
          :class="{
            'ctx__reply--editing': editingId === r.id,
            'ctx__reply--member': r.authorKind === 'member',
          }"
        >
          <!-- 會友接續留言（spec US10）：只顯示，隱藏、刪除在留言卡片上操作 -->
          <div class="ctx__meta">
            {{ r.authorName }} · {{ formatPostTime(r.createdAt)
            }}<template v-if="r.isHidden"> · 已隱藏</template>
          </div>
          <div class="ctx__reply-body">{{ r.body }}</div>
          <div v-if="isMine(r)" class="ctx__actions">
            <template v-if="editingId === r.id">
              <span class="ctx__editing">編輯中</span>
              <button type="button" class="btn btn--text" @click="stopEdit">取消編輯</button>
            </template>
            <template v-else>
              <button type="button" class="btn btn--text" @click="startEdit(r)">編輯</button>
              <button type="button" class="btn btn--text btn--danger" @click="confirmDelete(r.id)">
                刪除
              </button>
            </template>
          </div>
        </li>
      </ul>
    </template>

    <template #footer>
      <span v-if="editingId" class="ctx__as">回應者：{{ editingAuthor }}</span>
      <label v-else class="ctx__author">
        <span class="ctx__author-label">回應者</span>
        <input
          v-model="authorName"
          class="ctx__author-input"
          :placeholder="`未填寫預設為「${DEFAULT_REPLY_AUTHOR}」`"
          :maxlength="LIMITS.replyAuthor"
          enterkeyhint="done"
        />
      </label>
      <span class="ctx__count" :class="{ 'ctx__count--over': tooLong }">
        {{ body.length }}/{{ LIMITS.replyBody }}
      </span>
    </template>
  </ComposeSheet>
</template>

<style scoped lang="scss">
.ctx {
  &__meta {
    margin-bottom: 4px;
    font-size: 13px;
    color: var(--echo-muted);
  }

  &__body {
    font-size: 16px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  &__replies {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }

  &__reply {
    padding: 10px 12px;
    border-left: 3px solid var(--echo-primary);
    border-radius: 4px;
    background: var(--echo-bg);

    &--editing {
      outline: 2px solid var(--echo-primary);
    }

    // 會友接續留言：左側細線、不加底色（同留言卡片）
    &--member {
      padding: 2px 0 2px 12px;
      border-left: 2px solid var(--echo-line);
      border-radius: 0;
      background: transparent;
    }
  }

  &__reply-body {
    font-size: 15px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 2px 0 -6px -12px;
  }

  &__editing {
    padding-left: 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--echo-primary);
  }

  &__as {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 15px;
    color: var(--echo-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__author {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  &__author-label {
    flex-shrink: 0;
    font-size: 15px;
    color: var(--echo-muted);
  }

  &__author-input {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 16px; // 小於 16px 時 iOS 會自動放大頁面

    &:focus {
      outline: none;
    }
  }

  &__count {
    font-size: 13px;
    color: var(--echo-muted);
    font-variant-numeric: tabular-nums;

    &--over {
      color: var(--echo-danger);
    }
  }
}
</style>
