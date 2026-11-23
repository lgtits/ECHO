<script setup lang="ts">
// 回覆（ux.md A5；AC6.2、6.3、6.5）：手機、平板與講台模式用。
// 外觀與會友撰寫留言相同（ComposeSheet）；電腦的場次管理頁仍用右側面板 ReplyEditor。
// 上方只顯示原留言（最多 3 行），不列出已有的回覆與接續留言：iOS 上可捲動的區塊很難捲、
// 還會帶動後面的頁面（與 CommentSheet 相同，2026-11-23）。
// 編輯舊回覆改由留言卡片上的「編輯」開啟（editReplyId），刪除在卡片上（AC7.5）。
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { Post } from '@/types/models';
import { ANONYMOUS, DEFAULT_REPLY_AUTHOR, LIMITS } from '@/types/models';
import { useBoardStore } from '@/stores/board';
import { errorMessage } from '@/utils/errors';
import { formatPostTime } from '@/utils/time';
import { useReplyAuthor } from '@/composables/useReplyAuthor';
import ComposeSheet from './ComposeSheet.vue';

const props = defineProps<{
  post: Post;
  /** 有值時開啟就是編輯這則回覆；沒有值是新增回覆 */
  editReplyId?: string | null;
}>();
const open = defineModel<boolean>({ default: false });
const emit = defineEmits<{ hide: [] }>();

const $q = useQuasar();
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

const editing = computed(() =>
  editingId.value ? props.post.replies.find((r) => r.id === editingId.value) : undefined,
);

/** 開啟時依 editReplyId 決定是編輯舊回覆，還是接著寫新回覆的草稿 */
function load() {
  error.value = '';
  const r = props.editReplyId
    ? props.post.replies.find((x) => x.id === props.editReplyId && x.authorKind === 'staff')
    : undefined;
  editingId.value = r?.id ?? null;
  body.value = r ? r.body : readDraft();
}

load();
watch(
  () => [open.value, props.post.id, props.editReplyId] as const,
  ([isOpen]) => {
    if (isOpen) load();
  },
);

// 編輯舊回覆時不覆寫新回覆的草稿
watch(body, (v) => {
  if (!editingId.value) writeDraft(v);
});

const tooLong = computed(() => body.value.length > LIMITS.replyBody);
const canSend = computed(() => !!body.value.trim() && !tooLong.value && !sending.value);

async function submit() {
  if (!canSend.value) return;
  sending.value = true;
  error.value = '';
  try {
    if (editingId.value) {
      await board.updateReply(props.post.id, editingId.value, body.value);
      $q.notify({ message: '已儲存回覆' });
    } else {
      await board.addReply(props.post.id, body.value, authorName.value);
      body.value = '';
      $q.notify({ message: '已送出回覆' });
    }
    open.value = false;
  } catch (e) {
    error.value = errorMessage(e); // 失敗時保留內容
  } finally {
    sending.value = false;
  }
}

function onHide() {
  editingId.value = null;
  emit('hide');
}
</script>

<template>
  <ComposeSheet
    v-model="open"
    v-model:body="body"
    fixed-context
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
    <!-- 只顯示原留言，避免回覆時看不到題目 -->
    <template #context>
      <div class="ctx__meta">
        {{ post.nickname || ANONYMOUS }} · {{ formatPostTime(post.createdAt) }} · ↑
        {{ post.upvoteCount }}
      </div>
      <div class="ctx__body">{{ post.body }}</div>
    </template>

    <template #footer>
      <!-- 編輯舊回覆時名稱不變（spec D18），只顯示 -->
      <span v-if="editing" class="ctx__as">回應者：{{ editing.authorName }}</span>
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

  // 最多 3 行，上方區塊不需要捲動
  &__body {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    font-size: 16px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
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
