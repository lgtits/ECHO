import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /** 需要牧者或同工身分（AC5.1） */
    requiresStaff?: boolean;
  }
}
