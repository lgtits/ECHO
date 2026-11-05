import { defineRouter } from '#q-app';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';

import routes from './routes';
import { useAuthStore } from '@/stores/auth';

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter(({ store }) => {
  const createHistory = import.meta.env.QUASAR_SERVER
    ? createMemoryHistory
    : import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    // 只換 query（例如講台模式切換 ?post=）時不捲動
    scrollBehavior: (to, from, saved) =>
      saved ?? (to.path === from.path ? false : { left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE),
  });

  // 管理端路由守衛（AC5.1）：非管理帳號（含匿名身分）導向登入頁。
  // 這只是 UX；真正的權限由 RLS 保證（憲章）。
  Router.beforeEach(async (to) => {
    if (!to.matched.some((r) => r.meta.requiresStaff)) return true;
    const auth = useAuthStore(store);
    await auth.ensure();
    return auth.isStaff ? true : { path: '/admin/login', query: { redirect: to.fullPath } };
  });

  return Router;
});
