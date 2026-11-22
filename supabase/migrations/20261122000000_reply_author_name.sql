-- 回應者名稱（spec AC6.2、D18；plan §3.2）。
-- 只有一個共用管理帳號（D14），回覆不再快照帳號的 display_name，改由前端在送出時填寫，預設「牧者」。
-- 只能在新增時填；update 仍只開放 body，編輯回覆不會改名稱。

grant insert (post_id, body, author_name) on public.replies to authenticated;

-- 既有回覆的名稱是 display_name（最多 40 字），不回頭檢查
alter table public.replies
  add constraint replies_author_name_length
  check (char_length(author_name) between 1 and 20) not valid;

create or replace function public.replies_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.staff_members where user_id = auth.uid()) then
    raise exception 'echo:forbidden';
  end if;
  new.author_id := auth.uid();
  new.author_name := coalesce(nullif(btrim(new.author_name), ''), '牧者');
  new.body := btrim(new.body);
  new.session_id := (select session_id from public.posts where id = new.post_id);
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;
