// 回應者名稱（spec AC6.2、D18）：輸入框預設空白、以 placeholder 顯示「牧者」，留空送出即為「牧者」。
// 同一個分頁內記住上次填的名稱，連續回覆多則不必重填；新分頁回到空白。
// ReplySheet 與 ReplyEditor 共用同一個值。
import { ref, watch } from 'vue';

const KEY = 'echo.replyAuthor';

function read(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

const authorName = ref(read());

watch(authorName, (v) => {
  try {
    if (v) sessionStorage.setItem(KEY, v);
    else sessionStorage.removeItem(KEY);
  } catch {
    // 無痕模式等情況
  }
});

export function useReplyAuthor() {
  return authorName;
}
