-- 牧者回覆的編輯記錄（spec AC6.6、D22；plan §3、§4）。
-- 每次改內容，就把「改之前的內容」存一筆到 reply_edits；replies.edited_at 記最後一次編輯時間。
-- 會友與管理者都看得到（跟著回覆本身的可見性）；任何前端角色都不能新增、修改、刪除記錄。
-- 必須在 20261123010000_staff_member_comments.sql 之後執行。

-- ── 欄位與資料表 ─────────────────────────────────────────

alter table public.replies add column edited_at timestamptz; -- 沒編輯過為 null

create table public.reply_edits (
  id         uuid primary key default gen_random_uuid(),
  reply_id   uuid not null references public.replies on delete cascade,
  body       text not null,               -- 這次編輯「之前」的內容
  edited_at  timestamptz not null default now(),
  edited_by  uuid references public.staff_members (user_id) on delete set null
);
create index reply_edits_reply_idx on public.reply_edits (reply_id, edited_at);

-- ── Triggers ────────────────────────────────────────────

-- 內容真的有變（去頭尾空白後仍不同）才算編輯，填 edited_at
create or replace function public.replies_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    if old.author_kind = 'member' then
      raise exception 'echo:forbidden';
    end if;
    new.body := btrim(new.body);
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;

  if new.is_hidden is distinct from old.is_hidden then
    if old.author_kind <> 'member' then
      raise exception 'echo:forbidden';
    end if;
    if new.is_hidden then
      new.hidden_by := auth.uid();
      new.hidden_at := now();
    else
      new.hidden_by := null;
      new.hidden_at := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 把改之前的內容存起來。security definer：前端角色沒有 reply_edits 的寫入權限。
create function public.replies_log_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.reply_edits (reply_id, body, edited_at, edited_by)
    values (old.id, old.body, coalesce(new.edited_at, now()), auth.uid());
  return null;
end;
$$;

create trigger replies_log_edit after update of body on public.replies
  for each row when (old.body is distinct from new.body)
  execute function public.replies_log_edit();

-- ── 權限 ────────────────────────────────────────────────

grant select (edited_at) on public.replies to anon, authenticated;

revoke all on public.reply_edits from anon, authenticated;
-- edited_by 不開放（共用管理帳號，沒有意義）
grant select (id, reply_id, body, edited_at) on public.reply_edits to anon, authenticated;

alter table public.reply_edits enable row level security;

-- 看得到回覆就看得到它的編輯記錄（子查詢套用 replies 的 RLS：未封存、未隱藏、留言可見）
create policy reply_edits_select on public.reply_edits
  for select to anon, authenticated
  using (exists (select 1 from public.replies r where r.id = reply_id));
