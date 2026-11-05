import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { services } from '@/services';
import type { Viewer } from '@/types/models';

export const useAuthStore = defineStore('auth', () => {
  const viewer = ref<Viewer | null>(null);
  let loading: Promise<Viewer> | null = null;

  const isStaff = computed(() => !!viewer.value?.staff);
  const isPastor = computed(() => viewer.value?.staff?.role === 'pastor');
  const displayName = computed(() => viewer.value?.staff?.displayName ?? '');

  /** 第一次呼叫時取得身分（會友在背景建立匿名身分，AC1.4） */
  function ensure(): Promise<Viewer> {
    if (viewer.value) return Promise.resolve(viewer.value);
    loading ??= services.auth.getViewer().then((v) => (viewer.value = v));
    return loading;
  }

  async function signIn(email: string, password: string) {
    viewer.value = await services.auth.signIn(email, password);
  }

  async function signOut() {
    viewer.value = await services.auth.signOut();
  }

  return { viewer, isStaff, isPastor, displayName, ensure, signIn, signOut };
});
