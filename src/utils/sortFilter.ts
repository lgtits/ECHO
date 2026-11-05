// 留言排序與篩選（FR-006；AC3.3、AC6.1）。純函式，store 與講台模式共用。

import type { Post } from '@/types/models';

export type PostSort = 'newest' | 'top' | 'oldest';
export type AdminFilter = 'pending' | 'all' | 'hidden';

export const MEMBER_SORTS: PostSort[] = ['newest', 'top'];
export const ADMIN_SORTS: PostSort[] = ['top', 'newest', 'oldest'];

export const SORT_LABEL: Record<PostSort, string> = {
  newest: '最新',
  top: '最多附議',
  oldest: '最舊',
};

export const FILTER_LABEL: Record<AdminFilter, string> = {
  pending: '待回應',
  all: '全部',
  hidden: '已隱藏',
};

/** 只有文字回覆才算已回應（D3） */
export function isAnswered(p: Post): boolean {
  return p.replies.length > 0;
}

export function matchesFilter(p: Post, filter: AdminFilter): boolean {
  switch (filter) {
    case 'pending':
      return !p.isHidden && !isAnswered(p);
    case 'all':
      return !p.isHidden;
    case 'hidden':
      return p.isHidden;
  }
}

export function countByFilter(posts: Post[]): Record<AdminFilter, number> {
  const c = { pending: 0, all: 0, hidden: 0 };
  for (const p of posts) {
    if (p.isHidden) c.hidden++;
    else {
      c.all++;
      if (!isAnswered(p)) c.pending++;
    }
  }
  return c;
}

const time = (p: Post) => new Date(p.createdAt).getTime();

export function comparePosts(sort: PostSort): (a: Post, b: Post) => number {
  switch (sort) {
    case 'newest':
      return (a, b) => time(b) - time(a) || a.id.localeCompare(b.id);
    case 'oldest':
      return (a, b) => time(a) - time(b) || a.id.localeCompare(b.id);
    case 'top':
      // 附議數相同時，較新的在前
      return (a, b) =>
        b.upvoteCount - a.upvoteCount || time(b) - time(a) || a.id.localeCompare(b.id);
  }
}

export function sortPosts(posts: Post[], sort: PostSort): Post[] {
  return [...posts].sort(comparePosts(sort));
}

/** 依排序規則找出新項目應插入的位置（不重排既有項目，ux.md §6.1–6.2） */
export function insertionIndex(order: Post[], post: Post, sort: PostSort): number {
  const cmp = comparePosts(sort);
  const i = order.findIndex((p) => cmp(post, p) < 0);
  return i === -1 ? order.length : i;
}

/** 目前畫面上的順序是否和正確排序不同（「排序已變動，點此更新」） */
export function isOrderStale(order: Post[], sort: PostSort): boolean {
  const cmp = comparePosts(sort);
  for (let i = 1; i < order.length; i++) {
    if (cmp(order[i - 1]!, order[i]!) > 0) return true;
  }
  return false;
}
