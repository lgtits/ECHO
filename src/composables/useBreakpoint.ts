// 斷點（ux.md §2.1）：xs < 600、sm 600–1023、md 1024–1279、lg+ ≥ 1280
import { computed, onBeforeUnmount, ref } from 'vue';

const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1024);
let listening = 0;
const onResize = () => (width.value = window.innerWidth);

export function useBreakpoint() {
  if (typeof window !== 'undefined') {
    if (listening++ === 0) window.addEventListener('resize', onResize, { passive: true });
    onBeforeUnmount(() => {
      if (--listening === 0) window.removeEventListener('resize', onResize);
    });
  }
  return {
    width,
    isPhone: computed(() => width.value < 600),
    isTablet: computed(() => width.value >= 600 && width.value < 1024),
    /** ≥ 1024：A4 雙欄、會友撰寫框直接展開 */
    isDesktop: computed(() => width.value >= 1024),
    /** ≥ 1280：管理端左側欄 */
    isWide: computed(() => width.value >= 1280),
  };
}
