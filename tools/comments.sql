-- ログイン不要のコメント。Supabase の SQL Editor に貼って1回実行する。
-- 書いた人は、ブラウザごとの合言葉（secret）のハッシュで見分ける（自分のコメントだけ消せる）。
-- 管理者は Supabase の Table Editor（comments テーブル）からどのコメントでも消せる。

create table if not exists public.comments (
  id          bigint generated always as identity primary key,
  item        text not null,
  name        text,
  body        text not null,
  client_hash text not null,
  created_at  timestamptz not null default now()
);
create index if not exists comments_item_idx on public.comments (item, created_at);
alter table public.comments enable row level security;
revoke all on public.comments from anon, authenticated;

-- 一覧（mine = 自分が書いたものか）
create or replace function public.list_comments(items text[], secret text)
returns table (id bigint, item text, name text, body text, created_at timestamptz, mine boolean)
language sql security definer set search_path = public as $$
  select c.id, c.item, c.name, c.body, c.created_at, c.client_hash = md5(secret)
  from public.comments c where c.item = any(items) order by c.created_at;
$$;

-- 書く（300字まで。1人あたり1時間に20件まで）
create or replace function public.add_comment(p_item text, p_name text, p_body text, secret text)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if length(secret) < 16 or length(p_item) > 120 then raise exception 'bad request'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 or length(p_body) > 300 then raise exception 'body length'; end if;
  if length(coalesce(p_name, '')) > 24 then raise exception 'name length'; end if;
  if (select count(*) from public.comments where client_hash = md5(secret) and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many';
  end if;
  insert into public.comments (item, name, body, client_hash)
  values (p_item, nullif(trim(p_name), ''), trim(p_body), md5(secret)) returning id into new_id;
  return new_id;
end;
$$;

-- 自分のコメントを消す
create or replace function public.delete_comment(p_id bigint, secret text)
returns void language sql security definer set search_path = public as $$
  delete from public.comments where id = p_id and client_hash = md5(secret);
$$;

grant execute on function public.list_comments(text[], text) to anon;
grant execute on function public.add_comment(text, text, text, text) to anon;
grant execute on function public.delete_comment(bigint, text) to anon;
