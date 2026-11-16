-- 管理者可以永久刪除會友留言（spec D15、AC7.4；plan §4）。
-- 附議與回覆由外鍵 on delete cascade 一起刪除；posts_broadcast_removed trigger 會廣播 post_removed，
-- 所有開著的畫面即時移除這則留言。會友沒有 delete policy，RLS 不會讓他刪到任何一則（spec D9）。

grant delete on public.posts to authenticated;

create policy posts_delete on public.posts
  for delete to authenticated using ((select public.is_staff()));
