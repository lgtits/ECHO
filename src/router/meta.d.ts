import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /** 需要管理帳號（AC5.1） */
    requiresStaff?: boolean;
  }
}
