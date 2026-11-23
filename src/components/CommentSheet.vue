<script setup lang="ts">
// 接續留言（ux.md M5；spec US10）：會友在別人的留言底下接著寫。
// 外觀與撰寫留言相同（ComposeSheet），手機、平板、電腦都用面板；上方固定顯示原留言與底下已有的內容。
// 以管理者身分開啟時也是一般接續留言（不是牧者回覆），輸入框 placeholder 改為提示（AC10.9）。
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { Post } from '@/types/models';
import { ANONYMOUS, LIMITS } from '@/types/models';
import { useAuthStore } from '@/stores/auth';
import { useBoardStore } from '@/stores/board';
import { ServiceError } from '@/services';
import { errorMessage } from '@/utils/errors';
import { formatPostTime } from '@/utils/time';
import { useNickname } from '@/composables/useNickname';
import ComposeSheet from './ComposeSheet.vue';

const props = defineProps<{ post: Post }>();
const open = defineModel<boolean>({ default: false });

const $q = useQuasar();
const auth = useAuthStore();
const board = useBoardStore();
const nickname = useNickname();
const maxBody = LIMITS.commentBody;

// 每則留言各自的草稿，不小心關掉也不會遺失
const draftKey = computed(() => `echo.commentDraft.${props.post.id}`);
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
const sending = ref(false);
const error = ref('');

// 上方只顯示最近幾則，留言很多時輸入框才不會被擠小；較早的可以展開（ux.md M5）
const RECENT = 2;
const showAll = ref(false);
const sheet = ref<{ blur: () => void } | null>(null);

/** 展開較早的回應：收起鍵盤、上方區塊放大，才好捲動閱讀（iOS 鍵盤佔掉一半畫面） */
function expandOlder() {
  showAll.value = true;
  sheet.value?.blur();
}

const shownReplies = computed(() =>
  showAll.value ? props.post.replies : props.post.replies.slice(-RECENT),
);
const olderCount = computed(() => props.post.replies.length - shownReplies.value.length);

watch(body, writeDraft);
watch(
  () => props.post.id,
  () => {
    body.value = readDraft();
    error.value = '';
    showAll.value = false;
  },
);
watch(open, (v) => {
  if (v) {
    error.value = '';
    showAll.value = false;
  }
});

const tooLong = computed(() => body.value.length > maxBody);
// 場次結束後不能接續留言（AC10.4），管理者在這裡也一樣
const closed = computed(() => !board.writable);
const canSend = computed(
  () => !!body.value.trim() && !tooLong.value && !sending.value && !closed.value,
);
const shownError = computed(
  () => error.value || (closed.value ? errorMessage(new ServiceError('session_closed')) : ''),
);

async function submit() {
  if (!canSend.value) return;
  sending.value = true;
  error.value = '';
  try {
    await board.addComment(props.post.id, body.value, nickname.value);
    body.value = '';
    open.value = false;
    $q.notify({ message: '已送出，謝謝你的回應' });
  } catch (e) {
    error.value = errorMessage(e); // 失敗時保留內容（ux.md M3）
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <ComposeSheet
    ref="sheet"
    v-model="open"
    :context-tall="showAll"
    v-model:body="body"
    title="接續留言"
    text-label="接續留言內容"
    :placeholder="
      auth.isStaff
        ? '你目前以管理者身分登入，這裡的留言會顯示為一般會友留言；要以牧者身分回覆，請到管理頁。'
        : '接著這則留言寫下你的想法…'
    "
    :maxlength="maxBody + 50"
    :can-send="canSend"
    :sending="sending"
    :error="shownError"
    @submit="submit"
  >
    <!-- 原留言與底下已有的回覆、接續留言 -->
    <template #context>
      <div class="ctx__meta">
        {{ post.nickname || ANONYMOUS }} · {{ formatPostTime(post.createdAt) }} · ↑
        {{ post.upvoteCount }}
      </div>
      <div class="ctx__body">{{ post.body }}</div>

      <button
        v-if="olderCount > 0"
        type="button"
        class="btn btn--text ctx__older"
        @click="expandOlder"
      >
        顯示較早的 {{ olderCount }} 則回應
      </button>

      <ul v-if="shownReplies.length" class="ctx__replies">
        <li
          v-for="r in shownReplies"
          :key="r.id"
          class="ctx__reply"
          :class="{ 'ctx__reply--staff': r.authorKind === 'staff' }"
        >
          <div class="ctx__meta">{{ r.authorName }} · {{ formatPostTime(r.createdAt) }}</div>
          <div class="ctx__reply-body">{{ r.body }}</div>
        </li>
      </ul>
    </template>

    <template #footer>
      <label class="ctx__name">
        <span class="sr-only">暱稱（選填）</span>
        <input
          v-model="nickname"
          class="ctx__name-input"
          :placeholder="`暱稱（選填，不填顯示${ANONYMOUS}）`"
          :maxlength="LIMITS.nickname"
          autocomplete="nickname"
          enterkeyhint="done"
        />
      </label>
      <span class="ctx__count" :class="{ 'ctx__count--over': tooLong }">
        {{ body.length }}/{{ maxBody }}
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

  &__older {
    margin: 8px 0 -4px -12px;
    font-size: 14px;
    color: var(--echo-primary);
  }

  &__replies {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }

  // 接續留言：左側細線（同留言卡片）
  &__reply {
    padding: 2px 0 2px 12px;
    border-left: 2px solid var(--echo-line);

    // 牧者回覆：深抹茶細線＋白底（同回覆面板）
    &--staff {
      padding: 10px 12px;
      border-left: 3px solid var(--echo-primary);
      border-radius: 4px;
      background: var(--echo-bg);
    }
  }

  &__reply-body {
    font-size: 15px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  &__name {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }


  &__name-input {
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
