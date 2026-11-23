// 回覆的編輯記錄 → 版本列表（spec AC6.6、D22）。純函式，mock 與 supabase 共用。
// DB 每次編輯存的是「編輯之前」的內容與編輯時間，所以第 i 筆記錄是第 i 版（0 = 原始），
// 它開始的時間是前一次編輯的時間（原始版本是回覆時間）；最後一版是目前的內容。

import type { Reply, ReplyVersion } from '@/types/models';

export interface ReplyEdit {
  /** 這次編輯之前的內容 */
  body: string;
  editedAt: string;
}

export function buildVersions(reply: Pick<Reply, 'body' | 'createdAt'>, edits: ReplyEdit[]): ReplyVersion[] {
  const sorted = [...edits].sort((a, b) => a.editedAt.localeCompare(b.editedAt));
  const versions: ReplyVersion[] = sorted.map((e, i) => ({
    body: e.body,
    at: i === 0 ? reply.createdAt : sorted[i - 1]!.editedAt,
    index: i,
    current: false,
  }));
  versions.push({
    body: reply.body,
    at: sorted.length ? sorted[sorted.length - 1]!.editedAt : reply.createdAt,
    index: sorted.length,
    current: true,
  });
  return versions;
}
