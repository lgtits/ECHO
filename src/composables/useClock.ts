// 共用時鐘：相對時間（「3 分鐘前」）與自動結束倒數都用它，每 20 秒跳一次。
import { ref } from 'vue';

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

export function useClock() {
  if (!timer && typeof window !== 'undefined') {
    timer = setInterval(() => (now.value = Date.now()), 20000);
  }
  return now;
}

/** 立即更新一次（例如剛好到自動結束時間） */
export function tickClock() {
  now.value = Date.now();
}
