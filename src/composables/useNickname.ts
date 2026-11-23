// 會友暱稱（spec AC2.2、AC10.1）：記住這台裝置上次填的暱稱（localStorage）。
// 撰寫留言（PostComposer）與接續留言（CommentSheet）共用同一個值。
import { ref, watch } from 'vue';

const KEY = 'echo.nickname';

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

const nickname = ref(read());

watch(nickname, (v) => {
  try {
    const t = v.trim();
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    // 無痕模式等情況
  }
});

export function useNickname() {
  return nickname;
}
