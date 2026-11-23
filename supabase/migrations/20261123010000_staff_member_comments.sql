-- 管理者在會友留言板的接續留言存成一般接續留言，不是牧者回覆（spec AC10.9 2026-11-23 改；plan §3.2）。
-- 前端送出接續留言時指定 author_kind = 'member'；沒指定時（預設 'staff'）維持原本規則：
--   管理者 → 牧者回覆；會友 → 接續留言（會友指定 'staff' 也一樣存成接續留言，不會報錯）。
-- 必須在 20261123000000_member_comments.sql 之後執行。

grant insert (id, post_id, body, author_name, author_kind) on public.replies to authenticated;

create or replace function public.replies_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'echo:forbidden';
  end if;

  new.body := btrim(new.body);
  new.session_id := (select session_id from public.posts where id = new.post_id);
  new.is_hidden := false;
  new.hidden_by := null;
  new.hidden_at := null;
  new.created_at := now();
  new.updated_at := now();

  if new.author_kind = 'staff' and public.is_staff() then
    new.author_id := auth.uid();
    new.member_id := null;
    new.author_name := coalesce(nullif(btrim(new.author_name), ''), '牧者');
    return new;
  end if;

  -- 會友，或管理者在會友留言板：一般接續留言，規則與會友完全相同
  new.author_kind := 'member';
  new.author_id := null;
  new.member_id := auth.uid();
  new.author_name := coalesce(nullif(btrim(new.author_name), ''), '匿名');

  if not public.can_comment(new.post_id) then
    raise exception 'echo:session_closed';
  end if;

  if (
    select count(*) from public.replies
    where member_id = new.member_id and created_at > now() - interval '60 seconds'
  ) >= 5 then
    raise exception 'echo:rate_limited';
  end if;

  return new;
end;
$$;
