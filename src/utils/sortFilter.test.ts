import { describe, expect, it } from 'vitest';
import type { Post } from '@/types/models';
import {
  countByFilter,
  insertionIndex,
  isOrderStale,
  matchesFilter,
  sortPosts,
} from './sortFilter';

function post(id: string, minute: number, upvotes = 0, extra: Partial<Post> = {}): Post {
  return {
    id,
    sessionId: 's1',
    nickname: null,
    body: id,
    upvoteCount: upvotes,
    isHidden: false,
    hiddenByName: null,
    hiddenAt: null,
    createdAt: new Date(2026, 10, 8, 11, minute).toISOString(),
    replies: [],
    upvotedByMe: false,
    ...extra,
  };
}

const reply = {
  id: 'r',
  postId: 'x',
  authorId: null,
  authorName: '王牧師',
  body: '回覆',
  createdAt: '',
  updatedAt: '',
};

describe('sortPosts', () => {
  const posts = [post('a', 1, 3), post('b', 2, 9), post('c', 3, 3)];

  it('最新：新的在前', () => {
    expect(sortPosts(posts, 'newest').map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('最舊：舊的在前', () => {
    expect(sortPosts(posts, 'oldest').map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('最多附議：附議數相同時較新的在前', () => {
    expect(sortPosts(posts, 'top').map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('不改變原陣列', () => {
    sortPosts(posts, 'top');
    expect(posts.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('篩選（AC6.1）', () => {
  const answered = post('ans', 1, 0, { replies: [reply] });
  const hidden = post('hid', 2, 0, { isHidden: true });
  const pending = post('pen', 3);

  it('待回應 = 未隱藏且沒有文字回覆', () => {
    expect(
      [answered, hidden, pending].filter((p) => matchesFilter(p, 'pending')).map((p) => p.id),
    ).toEqual(['pen']);
  });

  it('全部不含已隱藏；已隱藏另列', () => {
    expect(countByFilter([answered, hidden, pending])).toEqual({ pending: 1, all: 2, hidden: 1 });
  });
});

describe('不跳動（ux.md §6）', () => {
  it('依排序找到插入位置', () => {
    const order = sortPosts([post('a', 1, 5), post('b', 2, 1)], 'top');
    expect(insertionIndex(order, post('n', 5, 3), 'top')).toBe(1);
    expect(insertionIndex(order, post('n', 5, 0), 'top')).toBe(2);
    expect(insertionIndex(order, post('n', 5, 0), 'newest')).toBe(0);
  });

  it('附議數變動後偵測順序已過期', () => {
    const order = [post('a', 1, 5), post('b', 2, 1)];
    expect(isOrderStale(order, 'top')).toBe(false);
    order[1]!.upvoteCount = 8;
    expect(isOrderStale(order, 'top')).toBe(true);
  });
});
