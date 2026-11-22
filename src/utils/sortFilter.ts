// 留言排序與篩選（FR-006；AC3.3、AC6.1）。純函式，store 與講台模式共用。

import type { Post } from '@/types/models';

export type PostSort = 'newest' | 'top' | 'oldest' | 'replied';
export type PostFilter = 'all' | 'pending' | 'answered' | 'hidden';
export type FilterCounts = Record<PostFilter, number>;

// 選單順序兩端相同：最新、最舊、最多附議、最新回應
export const MEMBER_SORTS: PostSort[] = ['newest', 'oldest', 'top', 'replied'];
export const ADMIN_SORTS: PostSort[] = ['newest', 'oldest', 'top', 'replied'];

/** 「全部」放第一個且為預設（D13）；會友看不到已隱藏 */
export const MEMBER_FILTERS: PostFilter[] = ['all', 'pending', 'answered'];
export const ADMIN_FILTERS: PostFilter[] = ['all', 'pending', 'answered', 'hidden'];

export const SORT_LABEL: Record<PostSort, string> = {
  newest: '最新',
  oldest: '最舊',
  top: '最多附議',
  replied: '最新回應',
};

export const FILTER_LABEL: Record<PostFilter, string> = {
  all: '全部',
  pending: '待回應',
  answered: '已回應',
  hidden: '已隱藏',
};

/** 只有文字回覆才算已回應（D3） */
export function isAnswered(p: Post): boolean {
  return p.replies.length > 0;
}

export function matchesFilter(p: Post, filter: PostFilter): boolean {
  switch (filter) {
    case 'pending':
      return !p.isHidden && !isAnswered(p);
    case 'answered':
      return !p.isHidden && isAnswered(p);
    case 'all':
      return !p.isHidden;
    case 'hidden':
      return p.isHidden;
  }
}

export function countByFilter(posts: Post[]): FilterCounts {
  const c = { all: 0, pending: 0, answered: 0, hidden: 0 };
  for (const p of posts) {
    if (p.isHidden) c.hidden++;
    else {
      c.all++;
      if (isAnswered(p)) c.answered++;
      else c.pending++;
    }
  }
  return c;
}

const time = (p: Post) => new Date(p.createdAt).getTime();
/** 最後一則回覆的時間；沒有回覆為 0 */
const replyTime = (p: Post) =>
  p.replies.reduce((max, r) => Math.max(max, new Date(r.createdAt).getTime() || 0), 0);

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
    case 'replied':
      // 最近有回覆的在前；沒有回覆的排在後面，依留言時間由新到舊
      return (a, b) => replyTime(b) - replyTime(a) || time(b) - time(a) || a.id.localeCompare(b.id);
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
