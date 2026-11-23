// 接續留言的輸入狀態（spec US10）：手機、平板的面板（CommentSheet）與電腦的卡片內表單（CommentInline）共用。
// 每則留言各自一份草稿（sessionStorage），不小心關掉也不會遺失；暱稱與撰寫留言共用。
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { Post } from '@/types/models';
import { LIMITS } from '@/types/models';
import { useAuthStore } from '@/stores/auth';
import { useBoardStore } from '@/stores/board';
import { ServiceError } from '@/services';
import { errorMessage } from '@/utils/errors';
import { useNickname } from './useNickname';

const MEMBER_PLACEHOLDER = '接著這則留言寫下你的想法…';
/** 管理者在會友留言板：存成一般接續留言，提示放在 placeholder（AC10.9） */
const STAFF_PLACEHOLDER =
  '你目前以管理者身分登入，這裡的留言會顯示為一般會友留言；要以牧者身分回覆，請到管理頁。';

export function useCommentDraft(post: () => Post) {
  const $q = useQuasar();
  const auth = useAuthStore();
  const board = useBoardStore();
  const nickname = useNickname();
  const maxBody = LIMITS.commentBody;

  const draftKey = () => `echo.commentDraft.${post().id}`;
  function readDraft(): string {
    try {
      return sessionStorage.getItem(draftKey()) ?? '';
    } catch {
      return '';
    }
  }
  function writeDraft(v: string) {
    try {
      if (v) sessionStorage.setItem(draftKey(), v);
      else sessionStorage.removeItem(draftKey());
    } catch {
      // 無痕模式等情況
    }
  }

  const body = ref(readDraft());
  const sending = ref(false);
  const error = ref('');

  watch(body, writeDraft);
  watch(
    () => post().id,
    () => {
      body.value = readDraft();
      error.value = '';
    },
  );

  const tooLong = computed(() => body.value.length > maxBody);
  // 場次結束後不能接續留言（AC10.4），管理者在會友頁也一樣
  const closed = computed(() => !board.writable);
  const canSend = computed(
    () => !!body.value.trim() && !tooLong.value && !sending.value && !closed.value,
  );
  const shownError = computed(
    () => error.value || (closed.value ? errorMessage(new ServiceError('session_closed')) : ''),
  );
  const placeholder = computed(() => (auth.isStaff ? STAFF_PLACEHOLDER : MEMBER_PLACEHOLDER));

  /** 成功回傳 true；失敗時保留內容並顯示錯誤（ux.md M3） */
  async function submit(): Promise<boolean> {
    if (!canSend.value) return false;
    sending.value = true;
    error.value = '';
    try {
      await board.addComment(post().id, body.value, nickname.value);
      body.value = '';
      $q.notify({ message: '已送出，謝謝你的回應' });
      return true;
    } catch (e) {
      error.value = errorMessage(e);
      return false;
    } finally {
      sending.value = false;
    }
  }

  return {
    body,
    nickname,
    sending,
    error,
    shownError,
    tooLong,
    canSend,
    placeholder,
    maxBody,
    submit,
  };
}
