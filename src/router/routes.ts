import type { RouteRecordRaw } from 'vue-router';

// 路由規劃：specs/001-sermon-qa/plan.md §6、ux.md §2
const routes: RouteRecordRaw[] = [
  // ── 會友端（MemberLayout）
  {
    path: '/',
    component: () => import('@/layouts/MemberLayout.vue'),
    children: [
      { path: '', component: () => import('@/pages/IndexPage.vue') },
      { path: 's/:code', component: () => import('@/pages/BoardPage.vue') },
      { path: 'now', component: () => import('@/pages/NowRedirect.vue') },
    ],
  },
  // 會友端放大（全螢幕，不套版型）
  { path: '/s/:code/stage', component: () => import('@/pages/StagePage.vue') },

  // ── 管理端
  { path: '/admin/login', component: () => import('@/pages/admin/LoginPage.vue') },
  {
    path: '/admin/sessions/:id/stage',
    component: () => import('@/pages/admin/StagePage.vue'),
    meta: { requiresStaff: true },
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresStaff: true },
    children: [
      {
        path: '',
        component: () => import('@/pages/admin/SessionListPage.vue'),
        // 新增場次：置中對話框疊在列表上（ux.md A3）
        children: [
          { path: 'sessions/new', component: () => import('@/pages/admin/SessionEditPage.vue') },
        ],
      },
      {
        path: 'sessions/:id',
        component: () => import('@/pages/admin/SessionManagePage.vue'),
        children: [{ path: 'edit', component: () => import('@/pages/admin/SessionEditPage.vue') }],
      },
    ],
  },

  // 必須放最後
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
