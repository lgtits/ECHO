import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { services } from '@/services';
import type { Viewer } from '@/types/models';

export const useAuthStore = defineStore('auth', () => {
  const viewer = ref<Viewer | null>(null);
  let loading: Promise<Viewer> | null = null;

  const isStaff = computed(() => !!viewer.value?.staff);
  const displayName = computed(() => viewer.value?.staff?.displayName ?? '');

  /** 第一次呼叫時取得身分（會友在背景建立匿名身分，AC1.4） */
  function ensure(): Promise<Viewer> {
    if (viewer.value) return Promise.resolve(viewer.value);
    loading ??= services.auth
      .getViewer()
      .then((v) => (viewer.value = v))
      .catch((e: unknown) => {
        loading = null; // 下次再試
        throw e;
      });
    return loading;
  }

  /** 管理端只輸入密碼（spec D14） */
  async function signIn(password: string) {
    viewer.value = await services.auth.signIn(password);
  }

  async function signOut() {
    viewer.value = await services.auth.signOut();
  }

  return { viewer, isStaff, displayName, ensure, signIn, signOut };
});
