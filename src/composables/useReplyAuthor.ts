// 回應者名稱（spec AC6.2、D18）：輸入框預設空白、以 placeholder 顯示「牧者」，留空送出即為「牧者」。
// 記住這台裝置上次填的名稱（localStorage），關掉瀏覽器、下次聚會再開也會自動帶入（2026-11-22）。
// ReplySheet 與 ReplyEditor 共用同一個值。
import { ref, watch } from 'vue';

const KEY = 'echo.replyAuthor';

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

const authorName = ref(read());

watch(authorName, (v) => {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    // 無痕模式等情況
  }
});

export function useReplyAuthor() {
  return authorName;
}
